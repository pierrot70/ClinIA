import { useEffect, useState } from "react";
import {
    createAppointment,
    fetchAvailableSlots,
} from "../services/appointmentsApi";
import type { ApiError } from "../types/api";

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const SPECIALISTS = [
    "Ophtalmologue",
    "Cardiologue",
    "Pneumologue",
    "Neurologue",
    "Endocrinologue",
    "Néphrologue",
    "Rhumatologue",
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function AppointmentsPage() {
    const [insuranceNumber, setInsuranceNumber] = useState("");
    const [specialist, setSpecialist] = useState("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [reason, setReason] = useState("");

    const [loading, setLoading] = useState(false);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);

    const [apiError, setApiError] = useState<ApiError | null>(null);
    const [success, setSuccess] = useState(false);

    /* ------------------------------------------------------------------ */
    /* Initialisation date (indicatif)                                    */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        const today = new Date().toISOString().split("T")[0];
        setDate(today);
    }, []);

    /* ------------------------------------------------------------------ */
    /* Rafraîchissement des créneaux (SOURCE DE VÉRITÉ)                   */
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

    /* 🔁 Recharge auto quand spécialiste ou date change */
    useEffect(() => {
        refreshSlots();
    }, [specialist, date]);

    /* ------------------------------------------------------------------ */
    /* Validation formulaire                                              */
    /* ------------------------------------------------------------------ */

    const isComplete =
        insuranceNumber.trim() !== "" &&
        specialist.trim() !== "" &&
        date.trim() !== "" &&
        time.trim() !== "";

    /* ------------------------------------------------------------------ */
    /* Création rendez-vous (API)                                         */
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
        });

        if ("error" in response) {
            setApiError(response.error);
            setLoading(false);
            return;
        }

        setSuccess(true);

        // 🔄 RAFRAÎCHISSEMENT DES CRÉNEAUX APRÈS CRÉATION
        await refreshSlots();

        // ❌ Heure devenue invalide → reset
        if (!availableSlots.includes(time)) {
            setTime("");
        }

        setLoading(false);
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold">
                Planifier un rendez-vous spécialiste
            </h1>

            {/* ---------------- Formulaire ---------------- */}
            <div className="grid grid-cols-1 gap-4">

                {/* Numéro d’assurance maladie — CRITIQUE */}
                <input
                    className="border-2 border-red-500 rounded p-2 focus:outline-none focus:ring-2 focus:ring-red-300"
                    placeholder="Numéro d’assurance maladie *"
                    value={insuranceNumber}
                    onChange={(e) => setInsuranceNumber(e.target.value)}
                />

                {/* Spécialiste */}
                <select
                    className="border rounded p-2"
                    value={specialist}
                    onChange={(e) => setSpecialist(e.target.value)}
                >
                    <option value="">Choisir un spécialiste *</option>
                    {SPECIALISTS.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>

                {/* Date */}
                <input
                    type="date"
                    className="border rounded p-2"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                />

                {/* Heure — CRITIQUE */}
                <input
                    type="time"
                    className="border-2 border-red-500 rounded p-2 focus:outline-none focus:ring-2 focus:ring-red-300"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                />

                {/* Créneaux disponibles (BACKEND) */}
                <div>
                    <div className="text-xs text-gray-500 mb-1">
                        Créneaux disponibles
                    </div>

                    {slotsLoading && (
                        <div className="text-xs text-gray-400">
                            Chargement des créneaux…
                        </div>
                    )}

                    {!slotsLoading && availableSlots.length === 0 && specialist && date && (
                        <div className="text-xs text-gray-400">
                            Aucun créneau disponible pour cette date.
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {availableSlots.map((slot) => (
                            <button
                                key={slot}
                                type="button"
                                onClick={() => setTime(slot)}
                                className={`px-2 py-1 text-xs border rounded hover:bg-gray-100 ${
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

                {/* Motif */}
                <textarea
                    className="border rounded p-2"
                    placeholder="Motif du rendez-vous (optionnel)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </div>

            {/* ---------------- Résumé + Action ---------------- */}
            <div className="border rounded p-4 bg-gray-50 space-y-3">
                <h2 className="font-medium">Résumé du rendez-vous</h2>

                {isComplete ? (
                    <>
                        <p>
                            <strong>Numéro d’assurance maladie :</strong>{" "}
                            {insuranceNumber}
                        </p>
                        <p>
                            <strong>Spécialiste :</strong> {specialist}
                        </p>
                        <p>
                            <strong>Date :</strong> {date} à {time}
                        </p>
                        {reason && (
                            <p>
                                <strong>Motif :</strong> {reason}
                            </p>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-gray-500">
                        Veuillez compléter tous les champs requis pour créer le
                        rendez-vous.
                    </p>
                )}

                <button
                    type="button"
                    onClick={handleCreateAppointment}
                    disabled={!isComplete || loading}
                    className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
                >
                    {loading
                        ? "Création en cours…"
                        : "Créer le rendez-vous"}
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
