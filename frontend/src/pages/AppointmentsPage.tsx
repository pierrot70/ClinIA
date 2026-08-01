import { useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import {
    createAppointment,
    fetchAvailableSlots,
} from "../services/appointmentsApi";
import {
    fetchCliniquesPaginated,
    type Clinique,
} from "../services/cliniqueApi";
import {
    fetchPatientById,
    fetchPatientsPaginated,
    type Patient,
} from "../services/patientsApi";
import {
    fetchSpecialistsPaginated,
    type Specialist,
} from "../services/specialistsApi";
import type { ApiError } from "../types/api";
import type { WriteVerificationMeta } from "../types/api";
import { SaveFeedback } from "../components/system/SaveFeedback";
import {
    formatWriteVerificationMessage,
    WriteVerificationReceipt,
} from "../components/system/WriteVerificationReceipt";
import {
    calculateDistanceKm,
    sortByDistance,
} from "../utils/geography";

function toLocalDateKey(value: string): string | null {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;

    return `${parsed.getFullYear()}-${String(
        parsed.getMonth() + 1
    ).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

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
    const { translated: specialistsLoading } = useTranslation({ text: source.specialist.loading, ...options });
    const { translated: chooseSpecialist } = useTranslation({ text: source.specialist.choose, ...options });
    const { translated: noSpecialist } = useTranslation({ text: source.specialist.none, ...options });
    const { translated: selectPatient } = useTranslation({ text: source.specialist.selectPatient, ...options });
    const { translated: cliniquesLoading } = useTranslation({ text: source.clinique.loading, ...options });
    const { translated: chooseClinique } = useTranslation({ text: source.clinique.choose, ...options });
    const { translated: noClinique } = useTranslation({ text: source.clinique.none, ...options });
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
        specialistsLoading,
        chooseSpecialist,
        noSpecialist,
        selectPatient,
        cliniquesLoading,
        chooseClinique,
        noClinique,
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
    const [specialists, setSpecialists] = useState<Specialist[]>([]);
    const [specialistsLoading, setSpecialistsLoading] =
        useState(false);
    const [specialistsError, setSpecialistsError] =
        useState<ApiError | null>(null);
    const [cliniques, setCliniques] = useState<Clinique[]>([]);
    const [cliniquesLoading, setCliniquesLoading] = useState(false);
    const [cliniquesError, setCliniquesError] =
        useState<ApiError | null>(null);

    /* ------------------------------------------------------------------ */
    /* Initialisation date                                                */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        const today = new Date().toISOString().split("T")[0];
        setDate(today);
    }, []);

    /* ------------------------------------------------------------------ */
    /* Chargement des spécialistes                                         */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        let cancelled = false;

        async function loadAllSpecialists() {
            setSpecialistsLoading(true);
            setSpecialistsError(null);
            const pageSize = 50;
            let currentPage = 1;
            let totalPages = 1;
            const all: Specialist[] = [];

            while (currentPage <= totalPages) {
                const response = await fetchSpecialistsPaginated({
                    page: currentPage,
                    limit: pageSize,
                });

                if ("error" in response) {
                    if (!cancelled) {
                        setSpecialistsError(response.error);
                    }
                    break;
                }

                all.push(...response.data.data);
                totalPages = Math.max(
                    response.data.meta.totalPages || 1,
                    1
                );
                currentPage += 1;
            }

            if (!cancelled) {
                setSpecialists(
                    all.sort((a, b) => {
                        const an = `${a.prenom} ${a.nom}`.trim();
                        const bn = `${b.prenom} ${b.nom}`.trim();
                        return an.localeCompare(bn, "fr");
                    })
                );
                setSpecialistsLoading(false);
            }
        }

        loadAllSpecialists();

        return () => {
            cancelled = true;
        };
    }, []);

    /* ------------------------------------------------------------------ */
    /* Chargement des cliniques                                            */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        let cancelled = false;

        async function loadAllCliniques() {
            setCliniquesLoading(true);
            setCliniquesError(null);
            const pageSize = 50;
            let currentPage = 1;
            let totalPages = 1;
            const all: Clinique[] = [];

            while (currentPage <= totalPages) {
                const response = await fetchCliniquesPaginated({
                    page: currentPage,
                    limit: pageSize,
                });

                if ("error" in response) {
                    if (!cancelled) {
                        setCliniquesError(response.error);
                    }
                    break;
                }

                all.push(...response.data.data);
                totalPages = Math.max(
                    response.data.meta.totalPages || 1,
                    1
                );
                currentPage += 1;
            }

            if (!cancelled) {
                setCliniques(all);
                setCliniquesLoading(false);
            }
        }

        loadAllCliniques();

        return () => {
            cancelled = true;
        };
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

    const filteredSpecialists = useMemo(() => {
        if (!clinique) return [];
        return specialists.filter(
            (sp) => sp.clinique_associer === clinique
        );
    }, [clinique, specialists]);

    const sortedCliniques = useMemo(
        () => sortByDistance(selectedPatient ?? {}, cliniques),
        [cliniques, selectedPatient]
    );

    function formatDistance(distance: number): string {
        return `${new Intl.NumberFormat(targetLang, {
            maximumFractionDigits: 1,
        }).format(distance)} km`;
    }

    async function handlePatientSelection(patient: Patient) {
        setPatientsError(null);

        const response = await fetchPatientById(patient._id);
        if ("error" in response) {
            setPatientsError(response.error);
            return;
        }

        const selected = response.data;
        setPatientId(selected._id);
        setSelectedPatient(selected);
        setInsuranceNumber(selected.num_assurance_maladie);
        setClinique("");
        setSpecialist("");
        setTime("");
        setAvailableSlots([]);
        setExistingAppointmentTimes([]);
        setMaximumAppointmentsReached(false);
        setApiError(null);
    }

    useEffect(() => {
        if (!clinique || !specialist) return;
        const stillValid = filteredSpecialists.some(
            (sp) => sp._id === specialist
        );
        if (!stillValid) {
            setSpecialist("");
            setAvailableSlots([]);
            setExistingAppointmentTimes([]);
            setMaximumAppointmentsReached(false);
            setTime("");
        }
    }, [clinique, filteredSpecialists, specialist]);

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
                patientId || undefined
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
    }, [specialist, date, patientId]);

    async function handleSpecialistChange(specialistId: string) {
        setSpecialist(specialistId);
        setDate("");
        setTime("");
        setAvailableSlots([]);
        setExistingAppointmentTimes([]);
        setMaximumAppointmentsReached(false);

        const selectedSpecialist = specialists.find(
            (candidate) => candidate._id === specialistId
        );
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const availableDates = Array.from(
            new Set(
                (selectedSpecialist?.disponibilites ?? [])
                    .map(toLocalDateKey)
                    .filter((candidate): candidate is string => {
                        if (!candidate) return false;
                        return new Date(`${candidate}T00:00:00`) >= today;
                    })
            )
        ).sort();

        for (const candidateDate of availableDates) {
            const response = await fetchAvailableSlots(
                specialistId,
                candidateDate,
                patientId || undefined
            );
            const schedule = "data" in response ? response.data : null;
            const slots = schedule?.slots ?? [];

            if (schedule?.maximumAppointmentsReached) {
                setDate(candidateDate);
                setAvailableSlots([]);
                setExistingAppointmentTimes(
                    schedule.existingAppointmentTimes
                );
                setMaximumAppointmentsReached(true);
                return;
            }

            if (slots.length > 0) {
                setDate(candidateDate);
                setAvailableSlots(slots);
                setExistingAppointmentTimes(
                    schedule?.existingAppointmentTimes ?? []
                );
                setMaximumAppointmentsReached(
                    schedule?.maximumAppointmentsReached ?? false
                );
                setTime(slots[0]);
                return;
            }
        }
    }

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
                    value={clinique}
                    onChange={(e) => setClinique(e.target.value)}
                    disabled={cliniquesLoading}
                >
                    <option value="">
                        {cliniquesLoading
                            ? ui.cliniquesLoading
                            : ui.chooseClinique}
                    </option>
                    {sortedCliniques.map((item) => {
                        const distance = selectedPatient
                            ? calculateDistanceKm(selectedPatient, item)
                            : null;
                        return (
                            <option key={item._id} value={item._id}>
                                {distance === null
                                    ? item.nom
                                    : `${item.nom} — ${formatDistance(distance)}`}
                            </option>
                        );
                    })}
                </select>
                {!cliniquesLoading && cliniques.length === 0 && (
                    <div className="text-xs text-gray-500">
                        {ui.noClinique}
                    </div>
                )}

                <select
                    className="border rounded p-2"
                    value={specialist}
                    onChange={(e) => {
                        void handleSpecialistChange(e.target.value);
                    }}
                    disabled={
                        !patientId ||
                        cliniquesLoading ||
                        !clinique
                    }
                >
                    <option value="">
                        {specialistsLoading
                            ? ui.specialistsLoading
                            : patientId && clinique
                                ? ui.chooseSpecialist
                                : patientId
                                    ? ui.chooseClinique
                                    : ui.selectPatient}
                    </option>
                    {filteredSpecialists.map((sp) => (
                        <option key={sp._id} value={sp._id}>
                            {`${sp.prenom} ${sp.nom}${
                                sp.specialite
                                    ? ` — ${sp.specialite}`
                                    : ""
                            }`}
                        </option>
                    ))}
                </select>
                {specialistsError && (
                    <div className="text-xs text-red-600">
                        {specialistsError.message}
                    </div>
                )}
                {cliniquesError && (
                    <div className="text-xs text-red-600">
                        {cliniquesError.message}
                    </div>
                )}
                {patientId && clinique && filteredSpecialists.length === 0 && (
                    <div className="text-xs text-gray-500">
                        {ui.noSpecialist}
                    </div>
                )}

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

                {/* Créneaux */}
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

                <textarea
                    className="border rounded p-2"
                    placeholder={ui.reasonPlaceholder}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </div>

            {/* ---------------- Action ---------------- */}

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
        </div>
    );
}
