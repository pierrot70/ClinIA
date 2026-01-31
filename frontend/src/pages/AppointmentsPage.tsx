import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
    createAppointment,
    fetchAvailableSlots,
} from "../services/appointmentsApi";
import {
    fetchPatientsPaginated,
    type Patient,
} from "../services/patientsApi";
import type { ApiError } from "../types/api";
import { SPECIALTIES } from "../data/specialties";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function AppointmentsPage() {
    const [searchParams] = useSearchParams();
    const [insuranceNumber, setInsuranceNumber] = useState("");
    const [specialist, setSpecialist] = useState("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [reason, setReason] = useState("");
    const [priority, setPriority] =
        useState<"normal" | "urgent">("normal");

    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState<ApiError | null>(null);
    const [success, setSuccess] = useState(false);

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
    const [ramqInitialized, setRamqInitialized] = useState(false);

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

    function generateRamqNumber() {
        const digits = Array.from({ length: 10 }, () =>
            Math.floor(Math.random() * 10).toString()
        ).join("");
        return `RAMQ${digits}`;
    }

    useEffect(() => {
        const ramq = searchParams.get("ramq");
        if (ramq) {
            setInsuranceNumber(ramq);
            setRamqInitialized(true);
            return;
        }

        if (!ramqInitialized) {
            setInsuranceNumber(generateRamqNumber());
            setRamqInitialized(true);
        }
    }, [searchParams, ramqInitialized]);

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

    /* ------------------------------------------------------------------ */
    /* Chargement des créneaux                                            */
    /* ------------------------------------------------------------------ */

    async function refreshSlots() {
        if (!specialist || !date) {
            setAvailableSlots([]);
            return;
        }

        setSlotsLoading(true);

        const response = await fetchAvailableSlots(specialist, date);

        if ("data" in response) {
            setAvailableSlots(response.data);
        }

        setSlotsLoading(false);
    }

    useEffect(() => {
        refreshSlots();
    }, [specialist, date]);

    /* ------------------------------------------------------------------ */
    /* Validation                                                         */
    /* ------------------------------------------------------------------ */

    const isComplete =
        insuranceNumber.trim() &&
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

        const response = await createAppointment({
            patientInsuranceNumber: insuranceNumber,
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

        setSuccess(true);
        await refreshSlots();

        if (!availableSlots.includes(time)) {
            setTime("");
        }

        setLoading(false);
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold">
                Créer un rendez-vous
            </h1>

            <div className="flex gap-4">
                <Link
                    to="/appointments"
                    className="px-3 py-1 border rounded bg-primary text-white"
                >
                    Création
                </Link>

                <Link
                    to="/appointments/list"
                    className="px-3 py-1 border rounded hover:bg-gray-100"
                >
                    Voir la liste
                </Link>
            </div>

            {/* ---------------- Formulaire ---------------- */}

            <div className="grid grid-cols-1 gap-4">
                <input
                    className="border-2 border-red-500 rounded p-2"
                    placeholder="Numéro d’assurance maladie *"
                    value={insuranceNumber}
                    onChange={(e) => setInsuranceNumber(e.target.value)}
                />

                <div className="border rounded p-3 bg-gray-50 space-y-2">
                    <div className="text-sm font-medium">
                        Rechercher un patient existant
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input
                            className="border rounded p-2"
                            placeholder="Nom"
                            value={searchNom}
                            onChange={(e) =>
                                setSearchNom(e.target.value)
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder="Prénom"
                            value={searchPrenom}
                            onChange={(e) =>
                                setSearchPrenom(e.target.value)
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder="Téléphone"
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
                                ? "Recherche…"
                                : "Rechercher"}
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
                            Aucun patient trouvé.
                        </div>
                    )}

                    {patients.length > 0 && (
                        <div className="flex flex-col gap-2">
                            {patients.map((p) => (
                                <button
                                    key={p._id}
                                    type="button"
                                    onClick={() =>
                                        setInsuranceNumber(
                                            p.num_assurance_maladie
                                        )
                                    }
                                    className="text-left border rounded p-2 hover:bg-gray-100"
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
                </div>

                <select
                    className="border rounded p-2"
                    value={specialist}
                    onChange={(e) => setSpecialist(e.target.value)}
                >
                    <option value="">Choisir un spécialiste *</option>
                    {SPECIALTIES.map((specialite) => (
                        <option key={specialite} value={specialite}>
                            {specialite}
                        </option>
                    ))}
                </select>

                {/* Priorité */}
                <div className="flex items-center gap-6">
                    <span className="text-sm font-medium">
                        Priorité
                    </span>

                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            checked={priority === "normal"}
                            onChange={() => setPriority("normal")}
                        />
                        Normal
                    </label>

                    <label className="flex items-center gap-2 text-red-600">
                        <input
                            type="radio"
                            checked={priority === "urgent"}
                            onChange={() => setPriority("urgent")}
                        />
                        Urgent
                    </label>
                </div>

                <input
                    type="date"
                    className="border rounded p-2"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
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
                        Créneaux disponibles
                    </div>

                    {slotsLoading && (
                        <div className="text-xs text-gray-400">
                            Chargement…
                        </div>
                    )}

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
                    placeholder="Motif (optionnel)"
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
                    {loading ? "Création…" : "Créer le rendez-vous"}
                </button>

                {apiError && (
                    <div className="text-sm text-red-600">
                        {apiError.message}
                    </div>
                )}

                {success && (
                    <div className="text-sm text-green-600">
                        Rendez-vous créé avec succès.
                    </div>
                )}
            </div>
        </div>
    );
}
