import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findOwn, findClinics, update, inventory, session } = vi.hoisted(() => ({
    findOwn: vi.fn(),
    findClinics: vi.fn(),
    update: vi.fn(),
    inventory: vi.fn(),
    session: {},
}));

vi.mock("../../models/Specialist.js", () => ({
    Specialist: { findOne: findOwn, updateOne: update },
}));
vi.mock("../../models/Clinique.js", () => ({
    Clinique: { find: findClinics },
}));
vi.mock("../appointments.js", () => ({
    AVAILABILITY_REMINDER_MINIMUM_NOTICE_MS: 15 * 60 * 1000,
    getPracticeLocations: specialist => specialist.practiceLocations,
    ownSpecialistFilter: auth => ({ accountUserId: auth.userId }),
    readAvailabilityInventory: inventory,
    runAppointmentWriteTransaction: callback => callback(session),
}));

import {
    completeOwnAvailability,
    getOwnAvailabilityTemplate,
    saveOwnAvailabilityTemplate,
} from "../ownAvailability.js";

const auth = { userId: "doctor", role: "MEDECIN" };
const audit = vi.fn();
const day = { clinique: "clinic-a", weekday: 0, start: "08:00", end: "16:00", slotType: "regular" };
const evening = { ...day, start: "16:00", end: "24:00" };
const night = { ...day, start: "00:00", end: "08:00" };

function mockSchedule(ranges) {
    const profile = {
        _id: "specialist",
        practiceLocations: ["clinic-a", "clinic-b"].map(clinique => ({
            clinique, disponibilites: [], walkInDisponibilites: [],
        })),
        weeklyAvailability: ranges,
    };
    const query = { select: () => query, session: () => query, lean: async () => profile };
    findOwn.mockReturnValue(query);
}

function savedSlots() {
    return update.mock.calls[0][1].$set.practiceLocations[0].disponibilites.map(date => date.toISOString());
}

beforeEach(() => {
    vi.clearAllMocks();
    const query = {
        select: () => query,
        session: () => query,
        lean: async () => [{ _id: "clinic-b", nom: "B" }, { _id: "clinic-a", nom: "A" }],
    };
    findClinics.mockReturnValue(query);
    inventory.mockImplementation(async () => ({
        count: 0, timesByDate: new Map(), occupied: new Set(), consultationsByDate: new Map(),
    }));
    mockSchedule([]);
});

afterEach(() => vi.useRealTimers());

describe("fixed clinic shifts", () => {
    it("exposes and saves all three shifts, including adjacent shifts in different clinics", async () => {
        const { clinics, shifts } = await getOwnAvailabilityTemplate(auth);
        expect(clinics).toEqual([{ id: "clinic-a", name: "A" }, { id: "clinic-b", name: "B" }]);
        expect(shifts).toEqual([
            { start: "08:00", end: "16:00" },
            { start: "16:00", end: "24:00" },
            { start: "00:00", end: "08:00" },
        ]);
        const secondClinicEvening = { ...evening, clinique: "clinic-b" };
        await expect(saveOwnAvailabilityTemplate(auth, [day, secondClinicEvening, night], audit))
            .resolves.toEqual({ ranges: [night, day, secondClinicEvening] });
    });

    it("rejects custom hours and duplicate shifts across clinics", async () => {
        await expect(saveOwnAvailabilityTemplate(auth, [{ ...day, end: "15:45" }], audit))
            .rejects.toMatchObject({ code: "INVALID_SCHEDULE" });
        await expect(saveOwnAvailabilityTemplate(auth, [day, { ...day, clinique: "clinic-b" }], audit))
            .rejects.toMatchObject({ code: "OVERLAPPING_SCHEDULE" });
        expect(update).not.toHaveBeenCalled();
    });

    it("asks the clinician to select a shift before filling a previously saved custom range", async () => {
        mockSchedule([{ ...day, end: "15:45" }]);
        await expect(completeOwnAvailability(auth, audit)).rejects.toMatchObject({ code: "SCHEDULE_REQUIRED" });
        expect(update).not.toHaveBeenCalled();
    });

    it("includes 23:45 exactly 15 minutes ahead and does not open the next day's night shift", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-09T04:30:00.000Z")); // Sunday at 23:30 Toronto.
        mockSchedule([evening, { ...night, weekday: 1 }]);
        await expect(completeOwnAvailability(auth, audit)).resolves.toEqual({ availableCount: 1, added: 1 });
        expect(savedSlots()).toEqual(["2026-11-09T04:45:00.000Z"]);
    });

    it("fills WalkIn first even when regular slots start earlier, then uses regular slots if needed", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-08T20:00:00.000Z")); // Sunday at 15:00 Toronto.
        mockSchedule([day, { ...evening, slotType: "walk_in", clinique: "clinic-b" }]);
        const date = "2026-11-08";
        const occupied = new Set(Array.from({ length: 30 }, (_, index) => {
            const quarter = index + 2;
            const hour = 16 + Math.floor(quarter / 4);
            const minute = String(quarter % 4 * 15).padStart(2, "0");
            return date + "T" + hour + ":" + minute;
        }));
        inventory.mockResolvedValue({
            count: 17, timesByDate: new Map(), occupied, consultationsByDate: new Map(),
        });

        await expect(completeOwnAvailability(auth, audit)).resolves.toEqual({ availableCount: 20, added: 3 });
        const [regularClinic, walkInClinic] = update.mock.calls[0][1].$set.practiceLocations;
        expect(regularClinic.disponibilites.map(slot => slot.toISOString()))
            .toEqual(["2026-11-08T20:15:00.000Z"]);
        expect(walkInClinic.walkInDisponibilites.map(slot => slot.toISOString()))
            .toEqual(["2026-11-08T21:00:00.000Z", "2026-11-08T21:15:00.000Z"]);
    });

    it("starts the night shift on the local day that begins at midnight", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-09T05:00:00.000Z")); // Monday at midnight Toronto.
        mockSchedule([{ ...night, weekday: 1 }]);
        await expect(completeOwnAvailability(auth, audit)).resolves.toEqual({ availableCount: 20, added: 20 });
        expect(savedSlots()[0]).toBe("2026-11-09T05:15:00.000Z");
        expect(savedSlots().at(-1)).toBe("2026-11-09T10:00:00.000Z");
    });
});
