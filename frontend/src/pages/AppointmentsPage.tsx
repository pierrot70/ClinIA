import { useEffect, useState } from "react";
import { createAppointment } from "../services/appointmentsApi";
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

const TIME_STEP_MINUTES = 15;
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 17;

function generateTimeSlots(): string[] {
    const slots: string[] = [];

    for (let hour = WORK_START_HOUR; hour < WORK_END_HOUR; hour++) {
        for (let min = 0; min < 60; min += TIME_STEP_MINUTES) {
            const h = hour.toString().padStart(2, "0");
            const m = min.toString().padStart(2, "0");
            slots.push(`${h}:${m}`);
        }
    }

    return slots;
}

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
    const [apiError, setApiError] = useState<ApiError | null>(null);
    const [success, setSuccess] = useState(false);

    const timeSlots = generateTimeSlots();

    /* ------------------------------------------------------------------ */
    /* Initialisation date (indicatif)                                    */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        const today = new Date().toISOString().split("T")[0];
        setDate(today);
    }, []);

    /* ------------------------------------------------------------------ */
    /* Validation réelle du formulaire                                    */
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

                {/* Numéro d’assurance maladie — CHAMP CRITIQUE */}
                <input
                    className="border-2 border-red-500 rounded p-2 focus:outline-none focus:ring-2 focus:ring-red-300"
                    placeholder="Numéro d’assurance maladie *"
                    value={insuranceNumber}
                    onChange={(e) =>
                        setInsuranceNumber(e.target.value)
                    }
                />

                <select
                    className="border rounded p-2"
                    value={specialist}
                    onChange={(e) =>
                        setSpecialist(e.target.value)
                    }
                >
                    <option value="">
                        Choisir un spécialiste *
                    </option>
                    {SPECIALISTS.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>

                <input
                    type="date"
                    className="border rounded p-2"
                    value={date}
                    onChange={(e) =>
                        setDate(e.target.value)
                    }
                />

                {/* Heure — CHAMP CRITIQUE */}
                <input
                    type="time"
                    className="border-2 border-red-500 rounded p-2 focus:outline-none focus:ring-2 focus:ring-red-300"
                    value={time}
                    onChange={(e) =>
                        setTime(e.target.value)
                    }
                />

                {/* Suggestions horaires */}
                <div>
                    <div className="text-xs text-gray-500 mb-1">
                        Suggestions (15 minutes)
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {timeSlots.map((slot) => (
                            <button
                                key={slot}
                                type="button"
                                onClick={() => setTime(slot)}
                                className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                            >
                                {slot}
                            </button>
                        ))}
                    </div>
                </div>

                <textarea
                    className="border rounded p-2"
                    placeholder="Motif du rendez-vous (optionnel)"
                    value={reason}
                    onChange={(e) =>
                        setReason(e.target.value)
                    }
                />
            </div>

            {/* ---------------- Résumé + Action ---------------- */}
            <div className="border rounded p-4 bg-gray-50 space-y-3">
                <h2 className="font-medium">
                    Résumé du rendez-vous
                </h2>

                {isComplete ? (
                    <>
                        <p>
                            <strong>Numéro d’assurance maladie :</strong>{" "}
                            {insuranceNumber}
                        </p>

                        <p>
                            <strong>Spécialiste :</strong>{" "}
                            {specialist}
                        </p>

                        <p>
                            <strong>Date :</strong>{" "}
                            {date} à {time}
                        </p>

                        {reason && (
                            <p>
                                <strong>Motif :</strong>{" "}
                                {reason}
                            </p>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-gray-500">
                        Veuillez compléter tous les champs requis pour créer le rendez-vous.
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
