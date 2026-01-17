import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
    /* 🔀 Mode d’affichage */
    const [view, setView] = useState<"create" | "list">("create");

    const [insuranceNumber, setInsuranceNumber] = useState("");
    const [specialist, setSpecialist] = useState("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [reason, setReason] = useState("");

    const [priority, setPriority] =
        useState<"normal" | "urgent">("normal");

    const [loading, setLoading] = useState(false);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);

    const [apiError, setApiError] = useState<ApiError | null>(null);
    const [success, setSuccess] = useState(false);

    /* ------------------------------------------------------------------ */
    /* Initialisation date                                                */
    /* ------------------------------------------------------------------ */

    useEffect(() => {
        const today = new Date().toISOString().split("T")[0];
        setDate(today);
    }, []);

    /* ------------------------------------------------------------------ */
    /* Rafraîchissement des créneaux                                      */
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
        if (view === "create") {
            refreshSlots();
        }
    }, [specialist, date, view]);

    /* ------------------------------------------------------------------ */
    /* Validation formulaire                                              */
    /* ------------------------------------------------------------------ */

    const isComplete =
        insuranceNumber.trim() !== "" &&
        specialist.trim() !== "" &&
        date.trim() !== "" &&
        time.trim() !== "";

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
                Gestion des rendez-vous
            </h1>

            <div className="flex gap-4">
                <Link
                    to="/appointments"
                    className="px-3 py-1 border rounded bg-primary text-white"
                >
                    Créer un rendez-vous
                </Link>

                <Link
                    to="/appointments/list"
                    className="px-3 py-1 border rounded hover:bg-gray-100"
                >
                    Voir tous les rendez-vous
                </Link>
            </div>

            {/* ============================================================= */}
            {/* ======================= CREATE ============================== */}
            {/* ============================================================= */}

            {view === "create" && (
                <>
                    {/* ---------------- Formulaire ---------------- */}
                    <div className="grid grid-cols-1 gap-4">

                        <input
                            className="border-2 border-red-500 rounded p-2"
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

                        {/* Priorité */}
                        <div className="flex items-center gap-6">
                            <span className="text-sm font-medium">
                                Priorité
                            </span>

                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    checked={priority === "normal"}
                                    onChange={() =>
                                        setPriority("normal")
                                    }
                                />
                                Normal
                            </label>

                            <label className="flex items-center gap-2 text-red-600">
                                <input
                                    type="radio"
                                    checked={priority === "urgent"}
                                    onChange={() =>
                                        setPriority("urgent")
                                    }
                                />
                                Urgent
                            </label>
                        </div>

                        <input
                            type="date"
                            className="border rounded p-2"
                            value={date}
                            onChange={(e) =>
                                setDate(e.target.value)
                            }
                        />

                        <input
                            type="time"
                            className="border-2 border-red-500 rounded p-2"
                            value={time}
                            onChange={(e) =>
                                setTime(e.target.value)
                            }
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
                                        onClick={() =>
                                            setTime(slot)
                                        }
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
                            onChange={(e) =>
                                setReason(e.target.value)
                            }
                        />
                    </div>

                    {/* ---------------- Action ---------------- */}
                    <div className="border rounded p-4 bg-gray-50 space-y-3">
                        <button
                            onClick={handleCreateAppointment}
                            disabled={!isComplete || loading}
                            className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
                        >
                            {loading
                                ? "Création…"
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
                </>
            )}

            {/* ============================================================= */}
            {/* ======================== LIST =============================== */}
            {/* ============================================================= */}

            {view === "list" && (
                <div className="border rounded p-6 bg-gray-50 text-sm text-gray-600">
                    🔜 **Liste des rendez-vous**

                    <div className="mt-2">
                        Cette section affichera tous les rendez-vous
                        (GET /api/appointments).
                    </div>
                </div>
            )}
        </div>
    );
}
