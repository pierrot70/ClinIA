import { Specialist } from "../models/Specialist.js";
import { Clinique } from "../models/Clinique.js";
import { isUrgentologist, URGENTOLOGIST_DAILY_LIMIT } from "../domain/specialties.js";
import { toSchedulingSlot } from "../utils/schedulingTime.js";
import {
    AVAILABILITY_REMINDER_MINIMUM_NOTICE_MS,
    getPracticeLocations,
    ownSpecialistFilter,
    readAvailabilityInventory,
    runAppointmentWriteTransaction,
} from "./appointments.js";

const TARGET_COUNT = 20;
const MAX_RANGES = 28;
const QUARTER_HOUR_MS = 15 * 60 * 1000;
const CLINIC_SHIFTS = [
    { start: "08:00", end: "16:00" },
    { start: "16:00", end: "24:00" },
    { start: "00:00", end: "08:00" },
];
const FIELDS = { regular: "disponibilites", walk_in: "walkInDisponibilites" };

function scheduleError(code, message) {
    return { code, message };
}

async function loadOwnSchedule(authUser, session = null) {
    const profile = await Specialist.findOne(ownSpecialistFilter(authUser))
        .select("+weeklyAvailability").session(session).lean();
    if (!profile) {
        throw scheduleError("SCHEDULE_UNAVAILABLE", "Aucune fiche professionnelle n’est associée à ce compte.");
    }

    const locations = getPracticeLocations(profile);
    const clinics = await Clinique.find({ _id: { $in: locations.map(location => location.clinique) } })
        .select("nom").session(session).lean();
    if (!clinics.length) {
        throw scheduleError("SCHEDULE_UNAVAILABLE", "Aucune clinique de pratique n’est associée à ce compte.");
    }

    const urgentologist = isUrgentologist(profile.specialite);
    const clinicIds = new Set(clinics.map(clinic => String(clinic._id)));
    const savedRanges = (profile.weeklyAvailability ?? []).map(range => ({ ...range, clinique: String(range.clinique) }));
    const ranges = savedRanges.filter(range =>
        clinicIds.has(range.clinique) && (!urgentologist || range.slotType === "walk_in"));
    return { profile, locations, clinics, clinicIds, urgentologist, ranges };
}

function isClinicShift({ start, end }) {
    return CLINIC_SHIFTS.some(shift => shift.start === start && shift.end === end);
}

function weekdayOf(date) {
    return new Date(date + "T00:00:00Z").getUTCDay();
}

export async function getOwnAvailabilityTemplate(authUser) {
    const { locations, clinics, urgentologist, ranges } = await loadOwnSchedule(authUser);
    const clinicsById = new Map(clinics.map(clinic => [String(clinic._id), clinic.nom]));
    return {
        clinics: locations.filter(location => clinicsById.has(location.clinique))
            .map(location => ({ id: location.clinique, name: clinicsById.get(location.clinique) })),
        slotTypes: urgentologist ? ["walk_in"] : ["walk_in", "regular"],
        todayWeekday: weekdayOf(toSchedulingSlot(new Date()).date),
        shifts: CLINIC_SHIFTS,
        ranges,
    };
}

function validateRanges(input, clinicIds, urgentologist) {
    if (!Array.isArray(input) || input.length < 1 || input.length > MAX_RANGES) {
        throw scheduleError("INVALID_SCHEDULE", "Indiquez de 1 à 28 plages hebdomadaires.");
    }

    const ranges = input.map(range => {
        const { clinique, weekday, start, end, slotType } = range ?? {};
        if (!clinicIds.has(clinique) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 ||
            !isClinicShift({ start, end }) ||
            !["regular", "walk_in"].includes(slotType) || (urgentologist && slotType !== "walk_in")) {
            throw scheduleError("INVALID_SCHEDULE", "Vérifiez la clinique, le jour, le type et le quart de travail.");
        }
        return { clinique, weekday, start, end, slotType };
    }).sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));

    for (let index = 1; index < ranges.length; index += 1) {
        const previous = ranges[index - 1];
        const current = ranges[index];
        if (current.weekday === previous.weekday && current.start < previous.end) {
            throw scheduleError("OVERLAPPING_SCHEDULE", "Les plages hebdomadaires se chevauchent.");
        }
    }
    return ranges;
}

export async function saveOwnAvailabilityTemplate(authUser, input, audit) {
    return runAppointmentWriteTransaction(async session => {
        const { profile, clinicIds, urgentologist } = await loadOwnSchedule(authUser, session);
        const ranges = validateRanges(input, clinicIds, urgentologist);
        await Specialist.updateOne(
            { _id: profile._id, ...ownSpecialistFilter(authUser) },
            { $set: { weeklyAvailability: ranges } },
            { session, runValidators: true }
        );
        await audit({ specialistId: profile._id, changedFields: ["weeklyAvailability"], session });
        return { ranges };
    });
}

function candidateSlots(ranges, now) {
    const first = now.getTime() + AVAILABILITY_REMINDER_MINIMUM_NOTICE_MS;
    const alignedStart = Math.ceil(first / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
    const today = toSchedulingSlot(now).date;
    const weekday = weekdayOf(today);
    const todayRanges = ranges.filter(range => range.weekday === weekday);
    if (!todayRanges.length) return [];

    const walkInSlots = [];
    const regularSlots = [];

    for (let instant = alignedStart; ; instant += QUARTER_HOUR_MS) {
        const start = new Date(instant);
        const { date, time } = toSchedulingSlot(start);
        if (date !== today) break;

        const range = todayRanges.find(range => range.start <= time && time < range.end);
        if (!range) continue;

        const candidates = range.slotType === "walk_in" ? walkInSlots : regularSlots;
        candidates.push({ start, date, time, range });
    }
    return [...walkInSlots, ...regularSlots];
}

export async function completeOwnAvailability(authUser, audit) {
    // Concurrent fills write the same specialist document. MongoDB retries a
    // conflicting transaction against the committed schedule before it can add slots.
    return runAppointmentWriteTransaction(async session => {
        const now = new Date();
        const { profile, locations, clinicIds, urgentologist, ranges } = await loadOwnSchedule(authUser, session);
        if (!ranges.length || ranges.some(range => !isClinicShift(range))) {
            throw scheduleError("SCHEDULE_REQUIRED", "Définissez d’abord votre horaire habituel.");
        }
        const weeklyRanges = validateRanges(ranges, clinicIds, urgentologist);
        const candidates = candidateSlots(weeklyRanges, now);
        const { count, timesByDate, occupied, consultationsByDate } = await readAvailabilityInventory(profile, now, {
            dates: candidates.map(slot => slot.date),
            session,
        });
        if (count >= TARGET_COUNT) return { availableCount: count, added: 0 };

        const locationByClinic = new Map(locations.map(location => [location.clinique, location]));
        for (const location of locations) {
            for (const start of [...location.disponibilites, ...location.walkInDisponibilites]) {
                const slot = toSchedulingSlot(start);
                if (slot) occupied.add(slot.date + "T" + slot.time);
            }
        }

        let added = 0;
        for (const { start, date, time, range } of candidates) {
            if (count + added >= TARGET_COUNT) break;
            const key = date + "T" + time;
            if (occupied.has(key)) continue;

            const freeTimes = timesByDate.get(date) ?? new Set();
            if (urgentologist && (consultationsByDate.get(date) ?? 0) + freeTimes.size >= URGENTOLOGIST_DAILY_LIMIT) continue;

            locationByClinic.get(range.clinique)[FIELDS[range.slotType]].push(start);
            occupied.add(key);
            freeTimes.add(time);
            timesByDate.set(date, freeTimes);
            added += 1;
        }

        if (added) {
            const [primary] = locations;
            const changedFields = ["practiceLocations", "disponibilites", "walkInDisponibilites"];
            await Specialist.updateOne(
                { _id: profile._id, ...ownSpecialistFilter(authUser) },
                { $set: {
                    practiceLocations: locations,
                    disponibilites: primary.disponibilites,
                    walkInDisponibilites: primary.walkInDisponibilites,
                } },
                { session, runValidators: true }
            );
            await audit({ specialistId: profile._id, changedFields, session });
        }
        return { availableCount: count + added, added };
    });
}
