import { UiMessage } from "../components/i18n/UiMessage";
import { ReceptionAttendanceDialog } from "../components/guides/ReceptionAttendanceDialog";
import { useEffect, useRef, useState } from "react";
import { useUiLabels } from "../hooks/useUiLabels";
import { labels } from "../i18n/uiLabels";
import {
    createWalkInBooking,
    fetchWalkInAvailability,
    findReceptionPatientByRamq,
    type ReceptionPatient,
    type WalkInAvailability,
    type WalkInDestinationClinic,
} from "../services/receptionApi";
import { useReceptionClinic } from "../contexts/ReceptionClinicContext";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { isReceptionLabel, receptionLabel } from "../i18n/receptionLabels";
import { receptionReplanLabels } from "../i18n/receptionReplanLabels";
import { urgentologistLabels, walkInEmergencyReminder } from "../i18n/urgentologistLabels";

import { walkInRoutingLabels } from "../i18n/walkInRoutingLabels";
import { displaySpecialty } from "../i18n/specialtyLabels";

import { GuidedWorkflow } from "../components/guides/GuidedWorkflow";
import { resolveWalkInGuide, WALK_IN_GUIDE } from "../components/guides/walkInGuide";
import { walkInGuideLabels } from "../i18n/walkInGuideLabels";

const source = labels.walkInArrival;

function focusGuideTarget(target: HTMLElement | null) {
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: "nearest" });
}

function clickGuideTarget(target: HTMLButtonElement | null) {
    // Explicit known control only; never resolve a selector from external text.
    if (target && !target.disabled) target.click();
}

function patientName(patient: Pick<ReceptionPatient, "prenom" | "nom">) {
    return `${patient.prenom} ${patient.nom}`.trim();
}

type SelectedWalkInSlot = {
    selectionMode?: "priority" | "earlier";
    destinationClinic?: WalkInDestinationClinic;
    prioritySpecialty?: WalkInAvailability["prioritySpecialty"];
    specialist: WalkInAvailability["today"][number]["specialist"];
    date: string;
    time: string;
    slotType: "regular" | "walk_in";
};

// New routing metadata must agree as a whole. A legacy response remains
// limited to 100 km; a partial/forged tolerance never expands that bound.
function effectiveSearchDistance(search: NonNullable<WalkInAvailability["search"]>): 100 | 110 | null {
    if (search.radiusKm !== 100) return null;
    if (search.toleranceKm === undefined && search.maxDistanceKm === undefined) return 100;
    return search.toleranceKm === 10 && search.maxDistanceKm === 110 ? 110 : null;
}

function AvailabilityOptions({
    availability,
    onChooseSlot,
    locale,
    introduction,
    onCompareEarlier,
    patientKind = "new",
    genericProfessionals = false,
}: {
    availability: WalkInAvailability;
    onChooseSlot?: (slot: SelectedWalkInSlot) => void;
    locale: string;
    introduction?: string;
    onCompareEarlier?: () => void;
    patientKind?: "new" | "existing" | "replacement";
    genericProfessionals?: boolean;
}) {
    const { t } = useUiLabels(locale);
    const urgent = urgentologistLabels(locale, availability.urgentologists?.limit);
    const [choice, setChoice] = useState<"family" | "tomorrow" | null>(null);
    useEffect(() => { setChoice(null); }, [availability]);
    const routing = walkInRoutingLabels(locale);
    const contextIntroduction = introduction ?? (patientKind === "replacement" ? receptionReplanLabels(locale).kept : patientKind === "existing" ? routing.existingAvailabilityIntro : receptionLabel(locale, "availabilityIntro", source.availabilityIntro));
    const [gapNoticeOpen, setGapNoticeOpen] = useState(false);
    useEffect(() => { setGapNoticeOpen(availability.search?.status === "exhausted" && !availability.search.hasUnlocatedClinics); }, [availability]);
    if (availability.search) {
        const distanceLimit = effectiveSearchDistance(availability.search);
        const exhaustedTitle = routing.exhaustedTitle.replace("{maxDistance}", String(distanceLimit ?? 100));
        const searchLimit = routing.searchLimit.replace("{radius}", "100").replace("{tolerance}", distanceLimit === 110 ? "10" : "0").replace("{maxDistance}", String(distanceLimit ?? 100));
        const reminder = <p role="alert" lang="en" translate="no" data-content-kind={walkInEmergencyReminder.kind}
            className="rounded border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">{walkInEmergencyReminder.text}</p>;
        const searchContext = <div className="space-y-1 text-sm text-slate-700"><p>{routing.priorityOrder}</p><p>{routing.dateScope}</p><p>{searchLimit}</p></div>;
        const invalidDestination = availability.search.status === "found" && (!availability.selectedClinic?._id
            || !Number.isFinite(availability.selectedClinic.distanceKm) || availability.selectedClinic.distanceKm < 0 || availability.selectedClinic.distanceKm > (distanceLimit ?? 100));
        if (distanceLimit === null || availability.search.status === "location_missing" || (availability.search.status === "exhausted" && availability.search.hasUnlocatedClinics) || invalidDestination) return <div className="space-y-3">
            {searchContext}
            <p role="status" className="font-semibold">{routing.locationMissingTitle}</p>
            <p>{routing.locationMissingHelp}</p>
            {reminder}
        </div>;
        if (availability.search.status === "exhausted") return <div className="space-y-3">
            {searchContext}
            <p role="status" className="font-semibold">{exhaustedTitle}</p>
            {reminder}
            {gapNoticeOpen && <div role="dialog" aria-modal="true" aria-labelledby="walkin-gap-notice-title"
                className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4">
                <div className="max-w-lg space-y-4 rounded-lg bg-white p-5 shadow-lg">
                    <h3 id="walkin-gap-notice-title" className="font-semibold">{exhaustedTitle}</h3>
                    <p>{routing.gapNotice}</p>
                    <button type="button" autoFocus className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => setGapNoticeOpen(false)}>{routing.gapAcknowledge}</button>
                </div>
            </div>}
        </div>;
        const destination = availability.selectedClinic;
        return <div className="space-y-3">
            {searchContext}
            {availability.search.hasUnlocatedClinics && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3">{routing.unlocatedWarning}</p>}
            <h3 className="font-semibold">{routing.primaryOffer}</h3>
            {destination && <div className="space-y-1 rounded border border-blue-200 bg-blue-50 p-3">
                <p className="font-semibold">{routing.destination.replace("{name}", destination.nom)}</p>
                <p>{routing.distance.replace("{distance}", new Intl.NumberFormat(locale).format(destination.distanceKm))}</p>
                {availability.prioritySpecialty && <p>{routing.professional.replace("{specialty}", displaySpecialty(availability.prioritySpecialty, locale))}</p>}
            </div>}
            {reminder}
            <AvailabilityOptions availability={{ today: availability.today, future: availability.future }}
                onChooseSlot={onChooseSlot ? slot => onChooseSlot({ ...slot, destinationClinic: destination, prioritySpecialty: availability.prioritySpecialty, selectionMode: "priority" }) : undefined}
                locale={locale} introduction={introduction} patientKind={patientKind} genericProfessionals={true} />
            {onCompareEarlier && <button type="button" className="rounded border border-blue-500 px-3 py-2 text-blue-800" onClick={onCompareEarlier}>{routing.compareEarlier}</button>}
            {availability.earlierAlternatives && <section className="space-y-3 border-t pt-3">
                <h3 className="font-semibold">{routing.earlierOffers.replace("{maxDistance}", String(distanceLimit))}</h3><p>{routing.earlierHelp}</p>
                {!availability.earlierAlternatives.length && <p role="status">{routing.noEarlier}</p>}
                {availability.earlierAlternatives.filter(option => option.clinic?._id && Number.isFinite(option.clinic.distanceKm) && option.clinic.distanceKm >= 0 && option.clinic.distanceKm <= distanceLimit).map((option, index) => <article key={`${option.clinic._id}:${option.specialist._id}:${option.date}:${index}`} className="space-y-2 rounded border bg-white p-3">
                    <p className="font-semibold">{routing.destination.replace("{name}", option.clinic.nom)}</p>
                    <p>{routing.distance.replace("{distance}", new Intl.NumberFormat(locale).format(option.clinic.distanceKm))}</p>
                    <p>{routing.professional.replace("{specialty}", displaySpecialty(option.prioritySpecialty, locale))}</p>
                    <AvailabilityOptions availability={{ today: [], future: [option] }} locale={locale} introduction={introduction} patientKind={patientKind} genericProfessionals={true}
                        onChooseSlot={onChooseSlot ? slot => onChooseSlot({ ...slot, destinationClinic: option.clinic, prioritySpecialty: option.prioritySpecialty, selectionMode: "earlier" }) : undefined} />
                </article>)}
            </section>}
        </div>;
    }
    if (availability.presentation === "alternatives" || availability.urgentologists?.allAtCapacity) {
        const familyAvailability = {
            today: availability.today.filter(option => option.specialist.specialty !== "Urgentologue"),
            future: availability.future.filter(option => option.specialist.specialty !== "Urgentologue"),
        };
        return <div className="space-y-3">
            <p role="status">{availability.urgentologists?.allAtCapacity ? urgent.full : urgent.unavailableToday}</p>
            <p role="alert" lang="en" translate="no" data-content-kind={walkInEmergencyReminder.kind}
                className="rounded border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">
                {walkInEmergencyReminder.text}
            </p>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-2" onClick={() => setChoice("tomorrow")}>{urgent.tomorrow}</button>
                <button type="button" className="rounded border px-3 py-2" onClick={() => setChoice("family")}>{urgent.family}</button>
            </div>
            {choice === "tomorrow" && <p role="status">{urgent.tomorrowNotice}</p>}
            {choice === "family" && <AvailabilityOptions availability={familyAvailability} onChooseSlot={onChooseSlot} locale={locale} introduction={introduction} patientKind={patientKind} genericProfessionals={genericProfessionals} />}
        </div>;
    }
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-700">{contextIntroduction}</p>
            <div>
                <h3 className="text-sm font-semibold text-slate-900">{genericProfessionals ? routing.routedToday : receptionLabel(locale, "availabilityToday", source.availabilityToday)}</h3>
                {availability.today.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-700">{genericProfessionals ? routing.routedNoToday : receptionLabel(locale, "noSameDayAvailability", source.noSameDayAvailability)}</p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {availability.today.map((option) => (
                            <li key={`${option.specialist._id}-${option.date}`} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                                <strong>{option.specialist.prenom} {option.specialist.nom}</strong>
                                {option.specialist.specialty === "Urgentologue" && <span> — {t(labels.pageUi.emergencyPhysician)}</span>}
                                <span className="ml-2">{option.date}</span>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {option.slots.map((time) => (
                                        <button
                                            key={time}
                                            type="button"
                                            onClick={() => onChooseSlot?.({
                                                specialist: option.specialist,
                                                date: option.date,
                                                time,
                                                slotType: option.slotTypes?.[time] ?? "walk_in",
                                            })}
                                            disabled={!onChooseSlot}
                                            className="rounded border border-blue-600 px-2 py-1 text-xs font-medium text-blue-700 disabled:border-slate-300 disabled:text-slate-600"
                                        >
                                            {time}{onChooseSlot ? ` — ${receptionLabel(locale, "chooseSlot", source.chooseSlot)}` : ""}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {availability.presentation !== "urgent_today" && <div>
                <h3 className="text-sm font-semibold text-slate-900">{genericProfessionals ? routing.routedFuture : receptionLabel(locale, "availabilityFuture", source.availabilityFuture)}</h3>
                {availability.future.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-700">{genericProfessionals ? routing.routedNoFuture : receptionLabel(locale, "noFutureAvailability", source.noFutureAvailability)}</p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {availability.future.map((option) => (
                            <li key={`${option.specialist._id}-${option.date}`} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                                <strong>{option.specialist.prenom} {option.specialist.nom}</strong>
                                {option.specialist.specialty === "Urgentologue" && <span> — {t(labels.pageUi.emergencyPhysician)}</span>}
                                <span className="ml-2">{option.date}</span>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {option.slots.map((time) => (
                                        <button
                                            key={time}
                                            type="button"
                                            onClick={() => onChooseSlot?.({
                                                specialist: option.specialist,
                                                date: option.date,
                                                time,
                                                slotType: option.slotTypes?.[time] ?? "walk_in",
                                            })}
                                            disabled={!onChooseSlot}
                                            className="rounded border border-blue-600 px-2 py-1 text-xs font-medium text-blue-700 disabled:border-slate-300 disabled:text-slate-600"
                                        >
                                            {time}{onChooseSlot ? ` — ${receptionLabel(locale, "chooseSlot", source.chooseSlot)}` : ""}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>}
        </div>
    );
}

export function WalkInArrivalPage() {
    const { locale } = useHomeI18n();
    const { t } = useUiLabels(locale);
    const replan = receptionReplanLabels(locale);
    const routing = walkInRoutingLabels(locale);
    const requestEpoch = useRef(0);
    const lastLookupKey = useRef("");
    const automaticLookup = useRef<(automatic?: boolean) => Promise<void>>(async () => {});
    const [attendancePatient, setAttendancePatient] = useState<ReceptionPatient | null>(null);
    const [guideActive, setGuideActive] = useState(false);
    const [detailsReviewed, setDetailsReviewed] = useState(false);
    const [needsLookup, setNeedsLookup] = useState(false);
    const guideText = walkInGuideLabels(locale);
    const ramqInput = useRef<HTMLInputElement>(null);
    const lookupButton = useRef<HTMLButtonElement>(null);
    const patientButton = useRef<HTMLButtonElement>(null);
    const availabilityButton = useRef<HTMLButtonElement>(null);
    const replacementButton = useRef<HTMLButtonElement>(null);
    const availabilityRegion = useRef<HTMLDivElement>(null);
    const identityRegion = useRef<HTMLDivElement>(null);
    const pendingRegion = useRef<HTMLDivElement>(null);
    const firstNameInput = useRef<HTMLInputElement>(null);
    const lastNameInput = useRef<HTMLInputElement>(null);
    const reviewRegion = useRef<HTMLParagraphElement>(null);
    const backButton = useRef<HTMLButtonElement>(null);
    const submitButton = useRef<HTMLButtonElement>(null);
    const finalWritePending = useRef(false);
    const [replacementId, setReplacementId] = useState<string | undefined>();
    const [rescheduled, setRescheduled] = useState(false);
    const [ramq, setRamq] = useState("");
    const [patients, setPatients] = useState<ReceptionPatient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<ReceptionPatient | null>(null);
    const [walkInAvailability, setWalkInAvailability] =
        useState<WalkInAvailability | null>(null);
    const [isNewPatient, setIsNewPatient] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<SelectedWalkInSlot | null>(null);
    const [newPatient, setNewPatient] = useState({ prenom: "", nom: "" });
    const [message, setMessage] = useState("");
    const [messageKind, setMessageKind] = useState<"noPatient" | "bookingCreated" | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { activeClinic, isLoading: clinicsLoading, error: clinicsError } = useReceptionClinic();
    const clinicId = activeClinic?._id || "";
    const existingPatient = selectedPatient || patients[0];
    const pending = existingPatient?.existingAppointments || [];

    function clearSelection() {
        requestEpoch.current++;
        lastLookupKey.current = "";
        setAttendancePatient(null);
        setNeedsLookup(false);
        setDetailsReviewed(false);
        setNewPatient({ prenom: "", nom: "" });
        setPatients([]); setSelectedPatient(null); setSelectedSlot(null);
        setWalkInAvailability(null); setReplacementId(undefined); setIsNewPatient(false);
        setLoading(false); setError(""); setMessage(""); setMessageKind(null); setRescheduled(false);
    }
    useEffect(() => {
        clearSelection();
        setRamq("");
        setNewPatient({ prenom: "", nom: "" });
        setGuideActive(false);
        return () => { requestEpoch.current++; };
    }, [clinicId]);

    useEffect(() => {
        if (isReceptionLabel(message, "noPatient", source.noPatient)) {
            setMessage("");
            setMessageKind("noPatient");
        }
    }, [locale, message]);

    async function loadWalkInAvailability(
        selectedClinicId = clinicId,
        patientId: string | null | undefined = selectedPatient?._id,
        replaceId: string | null | undefined = replacementId,
        compareEarlier = false
    ) {
        if (!selectedClinicId) {
            setError(source.availabilityRequiredClinic);
            return;
        }

        setError("");
        setSelectedSlot(null);
        setDetailsReviewed(false);
        setWalkInAvailability(null);
        const epoch = ++requestEpoch.current;
        setLoading(true);
        const proof = patientId ? (selectedPatient?._id === patientId ? selectedPatient.bookingProof : patients.find(patient => patient._id === patientId)?.bookingProof) : undefined;
        const response = compareEarlier
            ? await fetchWalkInAvailability(selectedClinicId, patientId || undefined, replaceId || undefined, proof, true)
            : await fetchWalkInAvailability(selectedClinicId, patientId || undefined, replaceId || undefined, proof);
        if (epoch !== requestEpoch.current) return;
        setLoading(false);

        if ("error" in response) {
            setNeedsLookup(response.error.code === "RECEPTION_REPLAN_REQUIRED");
            setError(response.error.code === "RECEPTION_REPLAN_REQUIRED" ? replan.conflict : response.error.message);
            return;
        }

        setWalkInAvailability(response.data || { today: [], future: [] });
    }

    async function searchPatient(automatic = false) {
        lastLookupKey.current = `${clinicId}:${ramq.trim()}`;
        setAttendancePatient(null);
        setNeedsLookup(false);
        setDetailsReviewed(false);
        const epoch = ++requestEpoch.current;
        setReplacementId(undefined);
        setRescheduled(false);
        setMessage("");
        setMessageKind(null);
        setError("");
        setSelectedPatient(null);
        setPatients([]);
        setWalkInAvailability(null);
        setIsNewPatient(false);
        setSelectedSlot(null);
        setNewPatient({ prenom: "", nom: "" });
        if (!ramq.trim()) {
            setError(receptionLabel(locale, "noPatient", source.noPatient));
            return;
        }

        if (!clinicId) {
            setError(source.availabilityRequiredClinic);
            return;
        }

        setLoading(true);
        const response = await findReceptionPatientByRamq(clinicId, ramq.trim());
        if (epoch !== requestEpoch.current) return;
        setLoading(false);

        if ("error" in response) {
            if (!automatic) setError(response.error.message);
            return;
        }

        const matches = response.data ? [response.data] : [];
        setPatients(matches);
        if (matches[0]?.hasHistoricalScheduledAppointments) setAttendancePatient(matches[0]);
        // Typing only performs an exact ClinIA lookup. Starting a new patient,
        // selecting an identity, choosing a slot and saving remain explicit.
        if (matches.length === 0 && !automatic) {
            setIsNewPatient(true);
            setMessageKind("noPatient");
            await loadWalkInAvailability(clinicId, null, null);
        }
    }

    automaticLookup.current = searchPatient;
    useEffect(() => {
        const insurance = ramq.trim();
        const key = `${clinicId}:${insurance}`;
        if (!clinicId || clinicsLoading || selectedSlot || insurance.length < 6 || lastLookupKey.current === key) return;
        const timer = window.setTimeout(() => {
            if (lastLookupKey.current === key) return;
            void automaticLookup.current(true);
        }, 600);
        return () => window.clearTimeout(timer);
    }, [ramq, clinicId, clinicsLoading, selectedSlot]);

    function updateAttendanceContext(patientId: string, bookingProof: string, hasUnresolved: boolean) {
        const update = (patient: ReceptionPatient): ReceptionPatient => patient._id === patientId
            ? { ...patient, bookingProof, hasHistoricalScheduledAppointments: hasUnresolved } : patient;
        setPatients(current => current.map(update));
        setSelectedPatient(current => current ? update(current) : null);
        setAttendancePatient(current => current ? update(current) : null);
    }

    const attendanceDialog = attendancePatient ? <ReceptionAttendanceDialog
        key={`${clinicId}:${attendancePatient._id}`} patient={attendancePatient} clinicId={clinicId} locale={locale}
        onClose={() => setAttendancePatient(null)}
        onIdentityConfirmed={patientId => {
            if (attendancePatient._id === patientId) setSelectedPatient(attendancePatient);
        }}
        onUpdated={updateAttendanceContext}
        onLookupRequired={() => {
            clearSelection(); setNeedsLookup(true);
            setError(receptionLabel(locale, "searchPatient", source.searchPatient));
        }}
    /> : null;

    function confirmSelection() {
        setMessage("");
        setError("");
        if (!selectedPatient || !clinicId) {
            setError(source.required);
            return;
        }
        void loadWalkInAvailability(clinicId, selectedPatient._id);
    }

    async function createPatientAndAppointment() {
        if (finalWritePending.current) return;
        if (!selectedSlot || !clinicId || !ramq.trim()) {
            setError(source.required);
            return;
        }
        if (!selectedPatient && (!newPatient.prenom.trim() || !newPatient.nom.trim())) {
            setError(source.required);
            return;
        }

        setError("");
        setLoading(true);
        const epoch = ++requestEpoch.current;
        finalWritePending.current = true;
        const response = await createWalkInBooking({
            clinic: selectedSlot.destinationClinic?._id || clinicId,
            ...(selectedSlot.destinationClinic ? { originClinic: clinicId, selectionMode: selectedSlot.selectionMode ?? "priority" } : {}),
            specialist: selectedSlot.specialist._id,
            date: selectedSlot.date,
            time: selectedSlot.time,
            slotType: selectedSlot.slotType,
            ...(replacementId ? { replaceAppointmentId: replacementId } : {}),
            ...(selectedPatient
                ? { patientId: selectedPatient._id, bookingProof: selectedPatient.bookingProof }
                : {
                    patient: {
                        prenom: newPatient.prenom.trim(),
                        nom: newPatient.nom.trim(),
                        num_assurance_maladie: ramq.trim(),
                        country: "CA",
                        healthInsuranceJurisdiction: "QC",
                        language: "fr",
                    },
                }),
        });
        finalWritePending.current = false;
        if (epoch !== requestEpoch.current) return;
        setLoading(false);

        if ("error" in response) {
            setNeedsLookup(["PATIENT_ALREADY_EXISTS", "RECEPTION_REPLAN_REQUIRED"].includes(response.error.code));
            if (response.error.code === "RECEPTION_LOOKUP_REQUIRED") {
                setSelectedSlot(null);
                setSelectedPatient(null);
                setPatients([]);
                setReplacementId(undefined);
                setWalkInAvailability(null);
                setError(receptionLabel(locale, "searchPatient", source.searchPatient));
                return;
            }
            if (selectedSlot.destinationClinic && ["NO_AVAILABILITY", "MAXIMUM_APPOINTMENTS_REACHED", "RECEIVING_PHYSICIAN_UNAVAILABLE"].includes(response.error.code)) {
                // No write retry: discard the stale route and require a fresh search.
                setSelectedSlot(null); setWalkInAvailability(null); setDetailsReviewed(false);
                setError(routing.availabilityChanged);
                return;
            }
            setError(response.error.code === "PATIENT_ALREADY_EXISTS" ? replan.patientExists : response.error.code === "MAXIMUM_APPOINTMENTS_REACHED" ? urgentologistLabels(locale).dailyLimitReached : response.error.code === "RECEPTION_REPLAN_REQUIRED" ? replan.conflict : response.error.code === "RECEIVING_PHYSICIAN_UNAVAILABLE"
                ? receptionLabel(locale, "receivingPhysicianUnavailable", source.receivingPhysicianUnavailable)
                : response.error.message);
            return;
        }

        setRescheduled(Boolean(replacementId));
        setReplacementId(undefined);
        setMessageKind(replacementId ? null : "bookingCreated");
        setMessage("");
        setSelectedSlot(null);
        setNewPatient({ prenom: "", nom: "" });
        setRamq("");
        setPatients([]);
        setSelectedPatient(null);
        setWalkInAvailability(null);
        setIsNewPatient(false);
    }

    const guideStep = resolveWalkInGuide({
        clinicReady: Boolean(clinicId) && !clinicsLoading,
        loading,
        completed: messageKind === "bookingCreated" || rescheduled,
        hasInsuranceNumber: Boolean(ramq.trim()),
        patientCount: patients.length,
        patientSelected: Boolean(selectedPatient),
        pendingAppointments: pending.length,
        hasAvailability: Boolean(walkInAvailability),
        slotSelected: Boolean(selectedSlot),
        isNewPatient,
        detailsComplete: Boolean(newPatient.prenom.trim() && newPatient.nom.trim()),
        detailsReviewed,
        hasError: Boolean(error),
        needsLookup,
    });

    // Focus only when navigating between regions, never when typing a name
    // becomes non-empty. No effect clicks a control or launches a request.
    const focusRegion = selectedSlot ? "form"
        : walkInAvailability ? "slots"
            : selectedPatient && pending.length ? "pending"
                : guideStep.key === "availability" ? "availability"
                    : patients.length ? "identity"
                : guideStep.key === "done" ? "done" : "lookup";
    useEffect(() => {
        if (!guideActive) return;
        if (focusRegion === "form") focusGuideTarget(selectedPatient ? reviewRegion.current : firstNameInput.current);
        else if (focusRegion === "slots") focusGuideTarget(availabilityRegion.current);
        else if (focusRegion === "identity") focusGuideTarget(identityRegion.current);
        else if (focusRegion === "pending") focusGuideTarget(pendingRegion.current);
        else if (focusRegion === "availability") focusGuideTarget(availabilityButton.current);
        else focusGuideTarget(ramqInput.current);
    }, [guideActive, focusRegion]);

    function runGuideAction() {
        if (!guideActive || loading || !clinicId || clinicsLoading || guideStep.disabled) return;
        switch (guideStep.key) {
            case "lookup": clickGuideTarget(lookupButton.current); break;
            case "identity": clickGuideTarget(patientButton.current); break;
            case "availability": clickGuideTarget(availabilityButton.current); break;
            case "existing": clickGuideTarget(replacementButton.current); break;
            case "slots": focusGuideTarget(availabilityRegion.current); break;
            case "details":
                if (!newPatient.prenom.trim()) focusGuideTarget(firstNameInput.current);
                else if (!newPatient.nom.trim()) focusGuideTarget(lastNameInput.current);
                else { setDetailsReviewed(true); focusGuideTarget(reviewRegion.current); }
                break;
            case "review":
                // Intentionally focus only. Saving always requires the user's
                // separate click on the existing confirmation control.
                focusGuideTarget(submitButton.current);
                break;
            case "problem": clickGuideTarget(backButton.current); break;
            case "lookupProblem": clearSelection(); break;
            case "done":
                setMessageKind(null); setRescheduled(false); setError("");
                focusGuideTarget(ramqInput.current);
                break;
        }
    }

    const stepKey = guideStep.key;
    const routedUnavailable = stepKey === "slots" && walkInAvailability?.search?.status === "exhausted";
    const routedIncomplete = stepKey === "slots" && walkInAvailability?.search?.status === "location_missing";
    const guideActionLabel = routedUnavailable ? routing.guideUnavailableAction : routedIncomplete ? routing.guideIncompleteAction : guideText[`${stepKey}Action` as keyof typeof guideText];
    const guide = <GuidedWorkflow active={guideActive} text={guideText}
        onStart={() => setGuideActive(true)} onStop={() => setGuideActive(false)}
        step={{
            title: routedUnavailable ? routing.guideUnavailableTitle : routedIncomplete ? routing.guideIncompleteTitle : guideText[`${stepKey}Title`],
            description: routedUnavailable ? routing.guideUnavailableDescription : routedIncomplete ? routing.locationMissingHelp : guideText[`${stepKey}Description`],
            current: guideStep.current,
            total: WALK_IN_GUIDE.total,
            ...(guideActionLabel ? { action: { label: guideActionLabel, disabled: guideStep.disabled, run: runGuideAction } } : {}),
        }} />;
    const targetClass = (active: boolean) => guideActive && active ? " outline outline-2 outline-offset-4 outline-blue-500" : "";

    const historicalNotice = selectedPatient?.hasHistoricalScheduledAppointments ? (
        <p role="status" className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-800">
            {receptionLabel(locale, "historicalScheduledNotice", source.historicalScheduledNotice)}
        </p>
    ) : null;

    if (selectedSlot) {
        const clinicName = selectedSlot.destinationClinic?.nom ?? activeClinic?.nom ?? clinicId;
        return (
            <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
                <header>
                    <h1 className="text-2xl font-semibold text-slate-900">
                        {replacementId ? replan.start : selectedPatient
                            ? receptionLabel(locale, "existingPatientFormTitle", source.existingPatientFormTitle)
                            : receptionLabel(locale, "newPatientFormTitle", source.newPatientFormTitle)}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        {replacementId ? replan.kept : selectedPatient
                            ? receptionLabel(locale, "existingPatientFormDescription", source.existingPatientFormDescription)
                            : receptionLabel(locale, "newPatientFormDescription", source.newPatientFormDescription)}
                    </p>
                </header>

                {attendanceDialog}
            {guide}

                {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><UiMessage message={error} /></p>}

                <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                    <p ref={reviewRegion} tabIndex={-1} className={"rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-800" + targetClass(guideStep.key === "review")}>
                        {receptionLabel(locale, "selectedSlot", source.selectedSlot)
                            .replace("{specialist}", `${selectedSlot.specialist.prenom} ${selectedSlot.specialist.nom}`)
                            .replace("{date}", selectedSlot.date)
                            .replace("{time}", selectedSlot.time)}
                        <span className="block text-slate-600">{selectedSlot.destinationClinic
                            ? routing.destination.replace("{name}", clinicName)
                            : receptionLabel(locale, "assignedClinic", source.assignedClinic).replace("{name}", clinicName)}</span>
                        {selectedSlot.destinationClinic && <span className="block text-slate-600">{routing.distance.replace("{distance}", new Intl.NumberFormat(locale).format(selectedSlot.destinationClinic.distanceKm))}</span>}
                        {selectedSlot.prioritySpecialty && <span className="block text-slate-600">{routing.professional.replace("{specialty}", displaySpecialty(selectedSlot.prioritySpecialty, locale))}</span>}
                    </p>

                    {selectedPatient ? (
                        <p className="text-sm font-medium text-slate-800">
                            {receptionLabel(locale, "existingPatientLabel", source.existingPatientLabel).replace("{name}", patientName(selectedPatient))}
                        </p>
                    ) : (
                        <>
                            <div className={"grid gap-3 sm:grid-cols-2" + targetClass(guideStep.key === "details")}>
                                <label className="text-sm font-medium text-slate-800">
                                    {receptionLabel(locale, "firstNameLabel", source.firstNameLabel)}
                                    <input
                                        ref={firstNameInput}
                                        value={newPatient.prenom}
                                        onChange={(event) => { setDetailsReviewed(false); setNewPatient((current) => ({ ...current, prenom: event.target.value })); }}
                                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                                        autoComplete="given-name"
                                    />
                                </label>
                                <label className="text-sm font-medium text-slate-800">
                                    {receptionLabel(locale, "lastNameLabel", source.lastNameLabel)}
                                    <input
                                        ref={lastNameInput}
                                        value={newPatient.nom}
                                        onChange={(event) => { setDetailsReviewed(false); setNewPatient((current) => ({ ...current, nom: event.target.value })); }}
                                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                                        autoComplete="family-name"
                                    />
                                </label>
                            </div>
                            <label className="block text-sm font-medium text-slate-800">
                                {receptionLabel(locale, "ramqReadOnlyLabel", source.ramqReadOnlyLabel)}
                                <input value={ramq} readOnly className="mt-1 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 font-normal text-slate-700" />
                            </label>
                        </>
                    )}

                    {historicalNotice}
                    <div className="flex flex-wrap gap-2">
                        <button ref={backButton} type="button" onClick={() => { setSelectedSlot(null); setDetailsReviewed(false); if (error) setWalkInAvailability(null); setError(""); }} disabled={loading} className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            {receptionLabel(locale, "backToAvailability", source.backToAvailability)}
                        </button>
                        <button ref={submitButton} type="button" onClick={() => void createPatientAndAppointment()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                            {loading
                                ? receptionLabel(locale, "creatingPatientAndAppointment", source.creatingPatientAndAppointment)
                                : replacementId ? replan.confirm : selectedPatient
                                    ? receptionLabel(locale, "createAppointment", source.createAppointment)
                                    : receptionLabel(locale, "createPatientAndAppointment", source.createPatientAndAppointment)}
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            <header>
                <h1 className="text-2xl font-semibold text-slate-900">{receptionLabel(locale, "title", source.title)}</h1>
                <p className="mt-1 text-sm text-slate-600">{receptionLabel(locale, "description", source.description)}</p>
            </header>

            {attendanceDialog}
            {guide}

            {(message || messageKind) && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{messageKind === "bookingCreated" ? receptionLabel(locale, "existingBookingCreated", source.existingBookingCreated) : messageKind === "noPatient" || isReceptionLabel(message, "noPatient", source.noPatient) ? receptionLabel(locale, "noPatient", source.noPatient) : message}</p>}
            {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{(isReceptionLabel(error, "noPatient", source.noPatient) || /active patient.*health insurance/i.test(error)) ? receptionLabel(locale, "noPatient", source.noPatient) : error}</p>}

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="walk-in-ramq">{receptionLabel(locale, "ramqLabel", source.ramqLabel)}</label>
                <div className={"flex gap-2" + targetClass(guideStep.key === "lookup")}>
                    <input ref={ramqInput} id="walk-in-ramq" value={ramq} onChange={(event) => { clearSelection(); setRamq(event.target.value); }} placeholder={t(source.ramqPlaceholder)} className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2" />
                    <button ref={lookupButton} type="button" onClick={() => void searchPatient()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{receptionLabel(locale, "searchPatient", source.searchPatient)}</button>
                </div>

                {patients.length > 0 && (
                    <div ref={identityRegion} tabIndex={-1} className={"mt-3 space-y-1" + targetClass(guideStep.key === "identity")}>
                        {patients.map((patient) => (
                            <button ref={patients.length === 1 ? patientButton : undefined} key={patient._id} disabled={loading} type="button" onClick={() => { setSelectedPatient(patient); setSelectedSlot(null); setDetailsReviewed(false); setReplacementId(undefined); setMessage(""); setError(""); setWalkInAvailability(null); }} className={`block w-full rounded border px-3 py-2 text-left text-sm ${selectedPatient?._id === patient._id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                                {patientName(patient)} <span className="float-right text-blue-700">{receptionLabel(locale, "selectPatient", source.selectPatient)}</span>
                            </button>
                        ))}
                    </div>
                )}
                {selectedPatient && <p className="mt-3 text-sm text-slate-700">{receptionLabel(locale, "selectedPatient", source.selectedPatient).replace("{name}", patientName(selectedPatient))}</p>}
                {historicalNotice}
                {rescheduled && <p role="status">{replan.success}</p>}
                {pending.length > 0 && <div ref={pendingRegion} tabIndex={-1} role="status" className={"mt-4 space-y-2 rounded border border-amber-300 bg-amber-50 p-4" + targetClass(guideStep.key === "existing" || guideStep.key === "ambiguous")}>
                    <p>{pending.length > 1 ? replan.conflict : replan.notice.replace("{date}", pending[0].date).replace("{time}", pending[0].time)}</p>
                    {pending.length === 1 && <p>{replan.kept}</p>}
                    {pending.length === 1 && <button ref={replacementButton} type="button" disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => {
                        setSelectedPatient(existingPatient); setReplacementId(pending[0]._id);
                        void loadWalkInAvailability(clinicId, existingPatient._id, pending[0]._id);
                    }}>{replan.start}</button>}
                </div>}

                {clinicsLoading ? (
                    <p className="mt-5 text-sm text-slate-600">{receptionLabel(locale, "availabilityLoading", source.availabilityLoading)}</p>
                ) : activeClinic ? (
                    <p className="mt-5 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        {receptionLabel(locale, "assignedClinic", source.assignedClinic).replace("{name}", activeClinic.nom)}
                    </p>
                ) : (
                    <p role="alert" className="mt-5 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {clinicsError || t(source.availabilityRequiredClinic)}
                    </p>
                )}

                {isNewPatient ? (
                    <div className="mt-5 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <div>
                            <h2 className="font-medium text-amber-950">{receptionLabel(locale, "newPatientTitle", source.newPatientTitle)}</h2>
                            <p className="mt-1 text-sm text-amber-900">{receptionLabel(locale, "newPatientDescription", source.newPatientDescription)}</p>
                        </div>
                        <button ref={availabilityButton} type="button" onClick={() => void loadWalkInAvailability()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{walkInAvailability ? receptionLabel(locale, "refreshAvailability", source.refreshAvailability) : receptionLabel(locale, "searchAvailability", source.searchAvailability)}</button>
                        {loading && <p className="text-sm text-slate-600">{t(source.availabilityLoading)}</p>}
                        {walkInAvailability && <div ref={availabilityRegion} tabIndex={-1} className={targetClass(guideStep.key === "slots")}><AvailabilityOptions availability={walkInAvailability} onChooseSlot={setSelectedSlot} locale={locale} onCompareEarlier={() => void loadWalkInAvailability(clinicId, selectedPatient?._id, replacementId, true)} /></div>}
                    </div>
                ) : (
                    <>
                        {pending.length === 0 && <button ref={availabilityButton} type="button" onClick={confirmSelection} disabled={!selectedPatient || loading} className="mt-4 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{walkInAvailability ? receptionLabel(locale, "refreshAvailability", source.refreshAvailability) : selectedPatient?.hasHistoricalScheduledAppointments ? receptionLabel(locale, "newArrival", source.newArrival) : receptionLabel(locale, "searchAvailability", source.searchAvailability)}</button>}
                        {selectedPatient && <p className="mt-3 text-sm text-slate-700">{receptionLabel(locale, "existingPatientDescription", source.existingPatientDescription)}</p>}
                        {loading && selectedPatient && <p className="mt-3 text-sm text-slate-600">{t(source.availabilityLoading)}</p>}
                        {selectedPatient && walkInAvailability && (
                            <div ref={availabilityRegion} tabIndex={-1} className={"mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4" + targetClass(guideStep.key === "slots")}>
                                <AvailabilityOptions availability={walkInAvailability} onChooseSlot={setSelectedSlot} locale={locale} onCompareEarlier={() => void loadWalkInAvailability(clinicId, selectedPatient?._id, replacementId, true)} patientKind={replacementId ? "replacement" : "existing"} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
