import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import {
    createAppointment,
    createAppointmentCoordinationRequest,
    fetchAppointmentRecommendation,
    fetchAvailableSlots,
    fetchManualAppointmentOptions,
    type AppointmentRecommendation,
    type AppointmentRecommendationStatus,
    type ManualAppointmentOptions,
} from "../services/appointmentsApi";
import {
    fetchPatientById,
    fetchPatientsPaginated,
    type Patient,
} from "../services/patientsApi";
import type { ApiError } from "../types/api";
import type { WriteVerificationMeta } from "../types/api";
import { SaveFeedback } from "../components/system/SaveFeedback";
import {
    formatWriteVerificationMessage,
    WriteVerificationReceipt,
} from "../components/system/WriteVerificationReceipt";
import { SPECIALTIES } from "../data/specialties";

function useAppointmentsPageLabels(targetLang: string) {
    const source = labels.appointmentsPage;
    const options = { targetLang, namespace: "appointments-page" };

    const { translated: title } = useTranslation({ text: source.title, ...options });
    const { translated: createTab } = useTranslation({ text: source.tabs.create, ...options });
    const { translated: listTab } = useTranslation({ text: source.tabs.list, ...options });
    const { translated: insurancePlaceholder } = useTranslation({ text: source.patientSearch.insurancePlaceholder, ...options });
    const { translated: patientSearchTitle } = useTranslation({ text: source.patientSearch.title, ...options });
    const { translated: lastNamePlaceholder } = useTranslation({ text: source.patientSearch.lastNamePlaceholder, ...options });
    const { translated: firstNamePlaceholder } = useTranslation({ text: source.patientSearch.firstNamePlaceholder, ...options });
    const { translated: phonePlaceholder } = useTranslation({ text: source.patientSearch.phonePlaceholder, ...options });
    const { translated: patientSearchLoading } = useTranslation({ text: source.patientSearch.loading, ...options });
    const { translated: patientSearchSubmit } = useTranslation({ text: source.patientSearch.submit, ...options });
    const { translated: patientSearchEmpty } = useTranslation({ text: source.patientSearch.empty, ...options });
    const { translated: patientSearchSelected } = useTranslation({ text: source.patientSearch.selected, ...options });
    const { translated: selectPatient } = useTranslation({ text: source.specialist.selectPatient, ...options });
    const { translated: specialtyChoose } = useTranslation({ text: source.specialist.specialtyChoose, ...options });
    const { translated: recommendationLoading } = useTranslation({ text: source.specialist.recommendationLoading, ...options });
    const { translated: recommendationNone } = useTranslation({ text: source.specialist.recommendationNone, ...options });
    const { translated: recommendationNoSpecialists } = useTranslation({ text: source.specialist.recommendationNoSpecialists, ...options });
    const { translated: recommendationNoAvailability } = useTranslation({ text: source.specialist.recommendationNoAvailability, ...options });
    const { translated: coordinationRequestExplanation } = useTranslation({ text: source.specialist.coordinationRequestExplanation, ...options });
    const { translated: coordinationRequestAction } = useTranslation({ text: source.specialist.coordinationRequestAction, ...options });
    const { translated: coordinationRequestLoading } = useTranslation({ text: source.specialist.coordinationRequestLoading, ...options });
    const { translated: coordinationRequestCreated } = useTranslation({ text: source.specialist.coordinationRequestCreated, ...options });
    const { translated: coordinationRequestAlreadyOpen } = useTranslation({ text: source.specialist.coordinationRequestAlreadyOpen, ...options });
    const { translated: recommendationTitle } = useTranslation({ text: source.specialist.recommendationTitle, ...options });
    const { translated: recommendationClinic } = useTranslation({ text: source.specialist.recommendationClinic, ...options });
    const { translated: recommendationSpecialist } = useTranslation({ text: source.specialist.recommendationSpecialist, ...options });
    const { translated: recommendationSlot } = useTranslation({ text: source.specialist.recommendationSlot, ...options });
    const { translated: recommendationUpdatedAfterConflict } = useTranslation({ text: source.specialist.recommendationUpdatedAfterConflict, ...options });
    const { translated: changeClinic } = useTranslation({ text: source.specialist.changeClinic, ...options });
    const { translated: manualAssignment } = useTranslation({ text: source.specialist.manualAssignment, ...options });
    const { translated: manualOptionsLoading } = useTranslation({ text: source.specialist.manualOptionsLoading, ...options });
    const { translated: manualClinicChoose } = useTranslation({ text: source.specialist.manualClinicChoose, ...options });
    const { translated: manualSpecialistChoose } = useTranslation({ text: source.specialist.manualSpecialistChoose, ...options });
    const { translated: manualScheduleChoose } = useTranslation({ text: source.specialist.manualScheduleChoose, ...options });
    const { translated: manualDateLabel } = useTranslation({ text: source.specialist.manualDateLabel, ...options });
    const { translated: manualSlotsEmpty } = useTranslation({ text: source.specialist.manualSlotsEmpty, ...options });
    const { translated: manualOptionsNone } = useTranslation({ text: source.specialist.manualOptionsNone, ...options });
    const { translated: priorityLabel } = useTranslation({ text: source.priority.label, ...options });
    const { translated: normalPriority } = useTranslation({ text: source.priority.normal, ...options });
    const { translated: urgentPriority } = useTranslation({ text: source.priority.urgent, ...options });
    const { translated: slotsLabel } = useTranslation({ text: source.slots.label, ...options });
    const { translated: slotsLoading } = useTranslation({ text: source.slots.loading, ...options });
    const { translated: existingPatientAppointment } = useTranslation({ text: source.slots.existingPatientAppointment, ...options });
    const { translated: maximumPatientAppointments } = useTranslation({ text: source.slots.maximumPatientAppointments, ...options });
    const { translated: reasonPlaceholder } = useTranslation({ text: source.reasonPlaceholder, ...options });
    const { translated: createLoading } = useTranslation({ text: source.action.loading, ...options });
    const { translated: createSubmit } = useTranslation({ text: source.action.submit, ...options });
    const { translated: createSuccess } = useTranslation({ text: source.action.success, ...options });
    const { translated: createFailure } = useTranslation({ text: source.action.failure, ...options });

    return {
        title,
        createTab,
        listTab,
        insurancePlaceholder,
        patientSearchTitle,
        lastNamePlaceholder,
        firstNamePlaceholder,
        phonePlaceholder,
        patientSearchLoading,
        patientSearchSubmit,
        patientSearchEmpty,
        patientSearchSelected,
        selectPatient,
        specialtyChoose,
        recommendationLoading,
        recommendationNone,
        recommendationNoSpecialists,
        recommendationNoAvailability,
        coordinationRequestExplanation,
        coordinationRequestAction,
        coordinationRequestLoading,
        coordinationRequestCreated,
        coordinationRequestAlreadyOpen,
        recommendationTitle,
        recommendationClinic,
        recommendationSpecialist,
        recommendationSlot,
        recommendationUpdatedAfterConflict,
        changeClinic,
        manualAssignment,
        manualOptionsLoading,
        manualClinicChoose,
        manualSpecialistChoose,
        manualScheduleChoose,
        manualDateLabel,
        manualSlotsEmpty,
        manualOptionsNone,
        priorityLabel,
        normalPriority,
        urgentPriority,
        slotsLabel,
        slotsLoading,
        existingPatientAppointment,
        maximumPatientAppointments,
        reasonPlaceholder,
        createLoading,
        createSubmit,
        createSuccess,
        createFailure,
    };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function AppointmentsPage() {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const ui = useAppointmentsPageLabels(targetLang);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [insuranceNumber, setInsuranceNumber] = useState("");
    const [patientId, setPatientId] = useState("");
    const [selectedPatient, setSelectedPatient] =
        useState<Patient | null>(null);
    const [specialty, setSpecialty] = useState("");
    const [clinique, setClinique] = useState("");
    const [specialist, setSpecialist] = useState("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [reason, setReason] = useState("");
    const [priority, setPriority] =
        useState<"normal" | "urgent">("normal");

    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [existingAppointmentTimes, setExistingAppointmentTimes] = useState<string[]>([]);
    const [maximumAppointmentsReached, setMaximumAppointmentsReached] = useState(false);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<ApiError | null>(null);
    const [success, setSuccess] = useState(false);
    const [lastWriteVerification, setLastWriteVerification] =
        useState<WriteVerificationMeta | null>(null);

    const [searchNom, setSearchNom] = useState("");
    const [searchPrenom, setSearchPrenom] = useState("");
    const [searchTelephone, setSearchTelephone] = useState("");
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [patientsError, setPatientsError] =
        useState<ApiError | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [hasSearchedPatients, setHasSearchedPatients] =
        useState(false);
    const [searchTimer, setSearchTimer] =
        useState<number | null>(null);
    const [recommendation, setRecommendation] =
        useState<AppointmentRecommendation | null>(null);
    const [recommendationLoading, setRecommendationLoading] =
        useState(false);
    const [recommendationError, setRecommendationError] =
        useState<ApiError | null>(null);
    const [recommendationStatus, setRecommendationStatus] =
        useState<AppointmentRecommendationStatus | null>(null);
    const [coordinationRequestLoading, setCoordinationRequestLoading] =
        useState(false);
    const [coordinationRequestError, setCoordinationRequestError] =
        useState<ApiError | null>(null);
    const [coordinationRequestAlreadyOpen, setCoordinationRequestAlreadyOpen] =
        useState<boolean | null>(null);
    const [manualMode, setManualMode] = useState(false);
    const [manualOptions, setManualOptions] =
        useState<ManualAppointmentOptions | null>(null);
    const [manualOptionsLoading, setManualOptionsLoading] = useState(false);
    const [manualOptionsError, setManualOptionsError] =
        useState<ApiError | null>(null);
    const recommendationRequestId = useRef(0);

    /* ------------------------------------------------------------------ */
    /* Initialisation date                                                */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        const today = new Date().toISOString().split("T")[0];
        setDate(today);
    }, []);

    /* ------------------------------------------------------------------ */
    /* Numéro RAMQ factice                                                */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        const ramq = searchParams.get("ramq");
        if (ramq) {
            setInsuranceNumber(ramq);
        }
    }, [searchParams]);

    /* ------------------------------------------------------------------ */
    /* Recherche patients                                                 */
    /* ------------------------------------------------------------------ */

    async function handleSearchPatients() {
        const nomTrim = searchNom.trim();
        const prenomTrim = searchPrenom.trim();
        const telTrim = searchTelephone.trim();

        if (!nomTrim && !prenomTrim && !telTrim) {
            setPatients([]);
            setHasSearchedPatients(false);
            return;
        }

        setPatientsLoading(true);
        setPatientsError(null);
        setHasSearchedPatients(true);

        const response = await fetchPatientsPaginated({
            page: 1,
            limit: 10,
            nom: nomTrim || undefined,
            prenom: prenomTrim || undefined,
            telephone: telTrim || undefined,
        });

        if ("error" in response) {
            setPatientsError(response.error);
            setPatients([]);
            setPatientsLoading(false);
            return;
        }

        setPatients(response.data.data);
        setPatientsLoading(false);
    }

    useEffect(() => {
        if (searchTimer) {
            window.clearTimeout(searchTimer);
        }

        const nomTrim = searchNom.trim();
        const prenomTrim = searchPrenom.trim();
        const telTrim = searchTelephone.trim();
        const hasMinInput =
            nomTrim.length >= 2 ||
            prenomTrim.length >= 2 ||
            telTrim.length >= 2;

        if (!nomTrim && !prenomTrim && !telTrim) {
            setPatients([]);
            setHasSearchedPatients(false);
            return;
        }

        if (!hasMinInput) {
            setPatients([]);
            setHasSearchedPatients(false);
            return;
        }

        const timer = window.setTimeout(() => {
            handleSearchPatients();
        }, 300);

        setSearchTimer(timer);

        return () => {
            window.clearTimeout(timer);
        };
    }, [searchNom, searchPrenom, searchTelephone]);

    function formatDistance(distance: number): string {
        return `${new Intl.NumberFormat(targetLang, {
            maximumFractionDigits: 1,
        }).format(distance)} km`;
    }

    async function handlePatientSelection(patient: Patient) {
        setPatientsError(null);
        recommendationRequestId.current += 1;

        const response = await fetchPatientById(patient._id);
        if ("error" in response) {
            setPatientsError(response.error);
            return;
        }

        const selected = response.data;
        setPatientId(selected._id);
        setSelectedPatient(selected);
        setInsuranceNumber(selected.num_assurance_maladie);
        setSpecialty("");
        setClinique("");
        setSpecialist("");
        setTime("");
        setAvailableSlots([]);
        setExistingAppointmentTimes([]);
        setMaximumAppointmentsReached(false);
        setRecommendation(null);
        setRecommendationLoading(false);
        setRecommendationError(null);
        setRecommendationStatus(null);
        setCoordinationRequestError(null);
        setCoordinationRequestAlreadyOpen(null);
        setManualMode(false);
        setManualOptions(null);
        setManualOptionsError(null);
        setApiError(null);
    }

    async function handleSpecialtyChange(nextSpecialty: string) {
        const requestId = recommendationRequestId.current + 1;
        recommendationRequestId.current = requestId;
        setSpecialty(nextSpecialty);
        setClinique("");
        setSpecialist("");
        setDate("");
        setTime("");
        setAvailableSlots([]);
        setExistingAppointmentTimes([]);
        setMaximumAppointmentsReached(false);
        setRecommendation(null);
        setRecommendationError(null);
        setRecommendationStatus(null);
        setCoordinationRequestError(null);
        setCoordinationRequestAlreadyOpen(null);
        setManualMode(false);
        setManualOptions(null);
        setManualOptionsError(null);

        if (!patientId || !nextSpecialty) return;

        setRecommendationLoading(true);
        const response = await fetchAppointmentRecommendation(
            patientId,
            nextSpecialty
        );
        if (recommendationRequestId.current !== requestId) return;

        setRecommendationLoading(false);
        if ("error" in response) {
            setRecommendationError(response.error);
            return;
        }

        const result = response.data;
        setRecommendation(result);
        setRecommendationStatus(
            response.meta?.recommendationStatus ??
                (result ? "AVAILABLE" : "NO_AVAILABLE_SLOTS_FOR_SPECIALTY")
        );
        if (!result) return;

        setClinique(result.clinique._id);
        setSpecialist(result.specialist._id);
        setDate(result.date);
        setTime(result.time);
        setAvailableSlots(result.availableSlots);
        setExistingAppointmentTimes(result.existingAppointmentTimes);
    }

    const manualSpecialistsForClinique = useMemo(
        () =>
            manualOptions?.specialists.filter(
                (item) => item.clinique_associer === clinique
            ) ?? [],
        [clinique, manualOptions]
    );

    async function enableManualAssignment() {
        if (!specialty) return;

        setManualMode(true);
        setManualOptionsLoading(true);
        setManualOptionsError(null);
        setClinique("");
        setSpecialist("");
        setDate("");
        setTime("");
        setAvailableSlots([]);
        setExistingAppointmentTimes([]);
        setMaximumAppointmentsReached(false);

        const response = await fetchManualAppointmentOptions(specialty);
        setManualOptionsLoading(false);
        if ("error" in response) {
            setManualOptionsError(response.error);
            return;
        }

        setManualOptions(response.data);
    }

    async function handleCoordinationRequest() {
        if (!patientId || !specialty) return;

        setCoordinationRequestLoading(true);
        setCoordinationRequestError(null);
        const response = await createAppointmentCoordinationRequest(
            patientId,
            specialty
        );
        setCoordinationRequestLoading(false);
        if ("error" in response) {
            setCoordinationRequestError(response.error);
            return;
        }

        setCoordinationRequestAlreadyOpen(response.data.alreadyOpen);
    }

    function handleManualCliniqueChange(cliniqueId: string) {
        setClinique(cliniqueId);
        setSpecialist("");
        setDate("");
        setTime("");
        setAvailableSlots([]);
        setExistingAppointmentTimes([]);
        setMaximumAppointmentsReached(false);
    }

    function handleManualSpecialistChange(specialistId: string) {
        setSpecialist(specialistId);
        setDate("");
        setTime("");
        setAvailableSlots([]);
        setExistingAppointmentTimes([]);
        setMaximumAppointmentsReached(false);
    }

    /* ------------------------------------------------------------------ */
    /* Chargement des créneaux                                            */
    /* ------------------------------------------------------------------ */

    async function refreshSlots(): Promise<string[]> {
        if (!specialist || !date) {
            setAvailableSlots([]);
            setExistingAppointmentTimes([]);
            setMaximumAppointmentsReached(false);
            return [];
        }

        setSlotsLoading(true);
        try {
            const response = await fetchAvailableSlots(
                specialist,
                date,
                patientId || undefined,
                clinique || undefined
            );
            const schedule = "data" in response ? response.data : null;
            const slots = schedule?.slots ?? [];

            setAvailableSlots(slots);
            setExistingAppointmentTimes(schedule?.existingAppointmentTimes ?? []);
            setMaximumAppointmentsReached(
                schedule?.maximumAppointmentsReached ?? false
            );
            return slots;
        } finally {
            setSlotsLoading(false);
        }
    }

    useEffect(() => {
        void refreshSlots();
    }, [specialist, date, patientId, clinique]);

    /* ------------------------------------------------------------------ */
    /* Validation                                                         */
    /* ------------------------------------------------------------------ */

    const isComplete =
        patientId.trim() &&
        clinique.trim() &&
        specialist.trim() &&
        date.trim() &&
        time.trim();

    /* ------------------------------------------------------------------ */
    /* Création rendez-vous                                               */
    /* ------------------------------------------------------------------ */

    async function handleCreateAppointment() {
        if (!isComplete) return;

        setLoading(true);
        setApiError(null);
        setSuccess(false);
        setLastWriteVerification(null);

        const response = await createAppointment({
            patient: patientId,
            clinique,
            specialist,
            date,
            time,
            reason,
            priority,
        });

        if ("error" in response) {
            const shouldRefreshRecommendation =
                Boolean(specialty) &&
                [
                    "NO_AVAILABILITY",
                    "SPECIALIST_ALREADY_BOOKED",
                    "APPOINTMENT_CONFLICT",
                ].includes(response.error.code);

            if (shouldRefreshRecommendation) {
                await handleSpecialtyChange(specialty);
                setApiError({
                    code: "APPOINTMENT_RECOMMENDATION_REFRESHED",
                    message: ui.recommendationUpdatedAfterConflict,
                    retryable: false,
                });
                setLoading(false);
                return;
            }

            setApiError(response.error);
            setLoading(false);
            return;
        }

        setLastWriteVerification(response.meta.writeVerification ?? null);
        setSuccess(true);
        setLoading(false);
        navigate("/appointments/list");
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold">
                {ui.title}
            </h1>

            <div className="flex gap-4">
                <Link
                    to="/appointments"
                    className="px-3 py-1 border rounded bg-primary text-white"
                >
                    {ui.createTab}
                </Link>

                <Link
                    to="/appointments/list"
                    className="px-3 py-1 border rounded hover:bg-gray-100"
                >
                    {ui.listTab}
                </Link>
            </div>

            {/* ---------------- Formulaire ---------------- */}

            <div className="grid grid-cols-1 gap-4">
                <input
                    className="border-2 border-red-500 rounded p-2"
                    placeholder={ui.insurancePlaceholder}
                    value={insuranceNumber}
                    readOnly
                />

                <div className="border rounded p-3 bg-gray-50 space-y-2">
                    <div className="text-sm font-medium">
                        {ui.patientSearchTitle}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input
                            className="border rounded p-2"
                            placeholder={ui.lastNamePlaceholder}
                            value={searchNom}
                            onChange={(e) =>
                                setSearchNom(e.target.value)
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder={ui.firstNamePlaceholder}
                            value={searchPrenom}
                            onChange={(e) =>
                                setSearchPrenom(e.target.value)
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder={ui.phonePlaceholder}
                            value={searchTelephone}
                            onChange={(e) =>
                                setSearchTelephone(e.target.value)
                            }
                        />
                        <button
                            type="button"
                            onClick={handleSearchPatients}
                            disabled={patientsLoading}
                            className="px-3 py-2 border rounded bg-white hover:bg-gray-100 disabled:opacity-50"
                        >
                            {patientsLoading
                                ? ui.patientSearchLoading
                                : ui.patientSearchSubmit}
                        </button>
                    </div>

                    {patientsError && (
                        <div className="text-xs text-red-600">
                            {patientsError.message}
                        </div>
                    )}

                    {hasSearchedPatients &&
                        !patientsLoading &&
                        patients.length === 0 && (
                        <div className="text-xs text-gray-500">
                            {ui.patientSearchEmpty}
                        </div>
                    )}

                    {patients.length > 0 && (
                        <div className="flex flex-col gap-2">
                    {patients.map((p) => (
                        <button
                            key={p._id}
                            type="button"
                            onClick={() => {
                                void handlePatientSelection(p);
                            }}
                            aria-pressed={selectedPatient?._id === p._id}
                            className={`text-left border rounded p-2 hover:bg-gray-100 ${
                                selectedPatient?._id === p._id
                                    ? "border-primary bg-blue-50"
                                    : ""
                            }`}
                        >
                                    <div className="text-sm font-medium">
                                        {p.prenom} {p.nom}
                                    </div>
                                    {p.telephone && (
                                        <div className="text-xs text-gray-600">
                                            {p.telephone}
                                        </div>
                                    )}
                                    <div className="text-xs text-gray-600">
                                        {p.num_assurance_maladie}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {selectedPatient && (
                        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-900">
                            {ui.patientSearchSelected.replace(
                                "{name}",
                                `${selectedPatient.prenom} ${selectedPatient.nom}`.trim()
                            )}
                        </div>
                    )}
                </div>

                <select
                    className="border rounded p-2"
                    value={specialty}
                    onChange={(e) => {
                        void handleSpecialtyChange(e.target.value);
                    }}
                    disabled={!patientId || recommendationLoading}
                >
                    <option value="">
                        {patientId ? ui.specialtyChoose : ui.selectPatient}
                    </option>
                    {SPECIALTIES.map((item) => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}
                </select>
                {recommendationLoading && (
                    <div className="text-xs text-gray-400">
                        {ui.recommendationLoading}
                    </div>
                )}
                {recommendationError && (
                    <div className="text-xs text-red-600">
                        {recommendationError.message}
                    </div>
                )}
                {patientId && specialty && !recommendationLoading && !recommendation && !recommendationError && (
                    <div
                        className={
                            recommendationStatus === "NO_SPECIALISTS_FOR_SPECIALTY"
                                ? "clinia-fade-in rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 text-base font-semibold text-red-900 shadow-lg"
                                : "text-xs text-gray-500"
                        }
                        role={recommendationStatus === "NO_SPECIALISTS_FOR_SPECIALTY" ? "alert" : undefined}
                    >
                        {recommendationStatus === "NO_SPECIALISTS_FOR_SPECIALTY"
                            ? ui.recommendationNoSpecialists.replace("{specialty}", specialty)
                            : recommendationStatus === "NO_AVAILABLE_SLOTS_FOR_SPECIALTY"
                                ? ui.recommendationNoAvailability.replace("{specialty}", specialty)
                                : ui.recommendationNone}
                    </div>
                )}
                {patientId && specialty &&
                    recommendationStatus === "NO_SPECIALISTS_FOR_SPECIALTY" && (
                    <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg space-y-3">
                        <div className="font-semibold text-base">{ui.coordinationRequestExplanation}</div>
                        {coordinationRequestError && (
                            <div className="text-xs text-red-700">
                                {coordinationRequestError.message}
                            </div>
                        )}
                        {coordinationRequestAlreadyOpen !== null ? (
                            <div className="text-sm font-medium">
                                {coordinationRequestAlreadyOpen
                                    ? ui.coordinationRequestAlreadyOpen
                                    : ui.coordinationRequestCreated}
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="w-full sm:w-fit rounded-lg bg-blue-700 px-5 py-3 text-base font-semibold text-white shadow-lg ring-2 ring-blue-300 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => {
                                    void handleCoordinationRequest();
                                }}
                                disabled={coordinationRequestLoading}
                            >
                                {coordinationRequestLoading
                                    ? ui.coordinationRequestLoading
                                    : ui.coordinationRequestAction}
                            </button>
                        )}
                    </div>
                )}
                {recommendation && (
                    <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 space-y-1">
                        <div className="font-medium">{ui.recommendationTitle}</div>
                        <div>
                            {ui.recommendationClinic}: {recommendation.clinique.nom} — {formatDistance(recommendation.clinique.distanceKm)}
                        </div>
                        <div>
                            {ui.recommendationSpecialist}: {`${recommendation.specialist.prenom} ${recommendation.specialist.nom}`.trim()}
                        </div>
                        <div>
                            {ui.recommendationSlot}: {recommendation.date} {recommendation.time}
                        </div>
                        <button
                            type="button"
                            className="mt-2 rounded border border-blue-500 bg-white px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                                void enableManualAssignment();
                            }}
                            disabled={manualOptionsLoading}
                        >
                            {ui.changeClinic}
                        </button>
                    </div>
                )}
                {patientId && specialty && !recommendationLoading && !recommendation &&
                    recommendationStatus !== "NO_SPECIALISTS_FOR_SPECIALTY" && (
                    <button
                        type="button"
                        className="w-fit border rounded px-3 py-2 text-sm"
                        onClick={() => {
                            void enableManualAssignment();
                        }}
                        disabled={manualOptionsLoading}
                    >
                        {ui.manualAssignment}
                    </button>
                )}
                {manualMode && (
                    <div className="rounded border bg-gray-50 p-3 space-y-3">
                        {manualOptionsLoading && (
                            <div className="text-xs text-gray-400">
                                {ui.manualOptionsLoading}
                            </div>
                        )}
                        {manualOptionsError && (
                            <div className="text-xs text-red-600">
                                {manualOptionsError.message}
                            </div>
                        )}
                        {manualOptions && manualOptions.cliniques.length === 0 && (
                            <div className="text-xs text-gray-500">
                                {ui.manualOptionsNone}
                            </div>
                        )}
                        {manualOptions && manualOptions.cliniques.length > 0 && (
                            <>
                                <select
                                    className="border rounded p-2"
                                    value={clinique}
                                    onChange={(event) =>
                                        handleManualCliniqueChange(event.target.value)
                                    }
                                >
                                    <option value="">{ui.manualClinicChoose}</option>
                                    {manualOptions.cliniques.map((item) => (
                                        <option key={item._id} value={item._id}>
                                            {item.nom}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className="border rounded p-2"
                                    value={specialist}
                                    disabled={!clinique}
                                    onChange={(event) =>
                                        handleManualSpecialistChange(event.target.value)
                                    }
                                >
                                    <option value="">{ui.manualSpecialistChoose}</option>
                                    {manualSpecialistsForClinique.map((item) => (
                                        <option key={item._id} value={item._id}>
                                            {`${item.prenom} ${item.nom}`.trim()}
                                        </option>
                                    ))}
                                </select>
                                {specialist && (
                                    <div className="space-y-2 border-t pt-3">
                                        <div className="text-sm font-medium">
                                            {ui.manualScheduleChoose}
                                        </div>
                                        <label className="flex flex-col gap-1 text-sm">
                                            <span>{ui.manualDateLabel}</span>
                                            <input
                                                type="date"
                                                className="border rounded p-2"
                                                value={date}
                                                onChange={(event) => {
                                                    setDate(event.target.value);
                                                    setTime("");
                                                }}
                                            />
                                        </label>
                                        {!date ? (
                                            <div className="text-xs text-gray-500">
                                                {ui.manualSlotsEmpty}
                                            </div>
                                        ) : (
                                            <>
                                                {slotsLoading && (
                                                    <div className="text-xs text-gray-400">
                                                        {ui.slotsLoading}
                                                    </div>
                                                )}
                                                {maximumAppointmentsReached ? (
                                                    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                                                        {ui.maximumPatientAppointments}
                                                    </div>
                                                ) : existingAppointmentTimes.length > 0 ? (
                                                    <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                                                        {ui.existingPatientAppointment.replace(
                                                            "{times}",
                                                            existingAppointmentTimes.join(", ")
                                                        )}
                                                    </div>
                                                ) : null}
                                                <div className="flex flex-wrap gap-2">
                                                    {availableSlots.map((slot) => (
                                                        <button
                                                            key={slot}
                                                            type="button"
                                                            onClick={() => setTime(slot)}
                                                            className={`px-2 py-1 text-xs border rounded ${
                                                                slot === time
                                                                    ? "bg-primary text-white"
                                                                    : ""
                                                            }`}
                                                        >
                                                            {slot}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {recommendationStatus !== "NO_SPECIALISTS_FOR_SPECIALTY" && (
                    <>
                        {/* Priorité */}
                        <div className="flex items-center gap-6">
                    <span className="text-sm font-medium">
                        {ui.priorityLabel}
                    </span>

                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            checked={priority === "normal"}
                            onChange={() => setPriority("normal")}
                        />
                        {ui.normalPriority}
                    </label>

                    <label className="flex items-center gap-2 text-red-600">
                        <input
                            type="radio"
                            checked={priority === "urgent"}
                            onChange={() => setPriority("urgent")}
                        />
                        {ui.urgentPriority}
                    </label>
                        </div>

                        {!manualMode && (
                    <>
                        <input
                            type="date"
                            className="border rounded p-2"
                            value={date}
                            onChange={(e) => {
                                setDate(e.target.value);
                                setTime("");
                            }}
                        />

                        <input
                            type="time"
                            className="border-2 border-red-500 rounded p-2"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                        />

                        <div>
                            <div className="text-xs text-gray-500 mb-1">
                                {ui.slotsLabel}
                            </div>

                            {slotsLoading && (
                                <div className="text-xs text-gray-400">
                                    {ui.slotsLoading}
                                </div>
                            )}

                            {maximumAppointmentsReached ? (
                                <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                                    {ui.maximumPatientAppointments}
                                </div>
                            ) : existingAppointmentTimes.length > 0 ? (
                                <div className="mb-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                                    {ui.existingPatientAppointment.replace(
                                        "{times}",
                                        existingAppointmentTimes.join(", ")
                                    )}
                                </div>
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                                {availableSlots.map((slot) => (
                                    <button
                                        key={slot}
                                        type="button"
                                        onClick={() => setTime(slot)}
                                        className={`px-2 py-1 text-xs border rounded ${
                                            slot === time
                                                ? "bg-primary text-white"
                                                : ""
                                        }`}
                                    >
                                        {slot}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                        )}

                        <textarea
                    className="border rounded p-2"
                    placeholder={ui.reasonPlaceholder}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                        />
                    </>
                )}
            </div>

            {/* ---------------- Action ---------------- */}

            {recommendationStatus !== "NO_SPECIALISTS_FOR_SPECIALTY" && (
                <div className="border rounded p-4 bg-gray-50 space-y-3">
                <button
                    onClick={handleCreateAppointment}
                    disabled={!isComplete || loading}
                    className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
                >
                    {loading ? ui.createLoading : ui.createSubmit}
                </button>

                {apiError && (
                    <SaveFeedback
                        type="error"
                        message={apiError.message || ui.createFailure}
                    />
                )}

                {success && (
                    <div>
                        <SaveFeedback
                            type="success"
                            message={formatWriteVerificationMessage(
                                ui.createSuccess,
                                lastWriteVerification
                            )}
                        />
                        <WriteVerificationReceipt
                            verification={lastWriteVerification}
                            labels={labels.writeVerification}
                        />
                    </div>
                )}
                </div>
            )}
        </div>
    );
}
