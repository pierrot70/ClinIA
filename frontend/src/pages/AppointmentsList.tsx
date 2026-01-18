import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    fetchAppointments,
    cancelAppointment,
    updateAppointmentStatus,
    type Appointment,
    type AppointmentStatus,
} from "../services/appointmentsApi";
import type { ApiError } from "../types/api";

/* ------------------------------------------------------------------ */
/* Hook debounce simple                                                */
/* ------------------------------------------------------------------ */

function useDebounce<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);

    return debounced;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function AppointmentsListPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

    /* ---------------- Filtres ---------------- */

    const [ramq, setRamq] = useState("");
    const [specialist, setSpecialist] = useState("");
    const [status, setStatus] = useState<AppointmentStatus | "">("");

    // ✅ IMPORTANT: stabiliser la référence de l'objet filtre
    const rawFilters = useMemo(
        () => ({ ramq, specialist, status }),
        [ramq, specialist, status]
    );

    const filters = useDebounce(rawFilters, 300);

    /* ---------------- Chargement ---------------- */

    useEffect(() => {
        loadAppointments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    async function loadAppointments() {
        setLoading(true);
        setError(null);

        const response = await fetchAppointments({
            patientInsuranceNumber: filters.ramq || undefined,
            specialist: filters.specialist || undefined,
            status: filters.status || undefined,
        });

        if ("error" in response) {
            setError(response.error);
            setLoading(false);
            return;
        }

        setAppointments(response.data);
        setLoading(false);
    }

    function setBusy(id: string, value: boolean) {
        setBusyIds((prev) => ({ ...prev, [id]: value }));
    }

    async function handleAction(id: string, action: () => Promise<any>) {
        setBusy(id, true);
        setError(null);

        const response = await action();

        if ("error" in response) {
            setError(response.error);
            setBusy(id, false);
            return;
        }

        await loadAppointments();
        setBusy(id, false);
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <div className="flex justify-between">
                <h1 className="text-2xl font-semibold">
                    Tous les rendez-vous
                </h1>

                <Link
                    to="/appointments"
                    className="px-3 py-1 border rounded hover:bg-gray-100"
                >
                    Créer un rendez-vous
                </Link>
            </div>

            {/* =================== Filtres =================== */}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                    className="border rounded p-2"
                    placeholder="RAMQ"
                    value={ramq}
                    onChange={(e) => setRamq(e.target.value)}
                />

                <input
                    className="border rounded p-2"
                    placeholder="Spécialiste"
                    value={specialist}
                    onChange={(e) => setSpecialist(e.target.value)}
                />

                <select
                    className="border rounded p-2"
                    value={status}
                    onChange={(e) =>
                        setStatus(e.target.value as AppointmentStatus | "")
                    }
                >
                    <option value="">Tous les statuts</option>
                    <option value="scheduled">Planifié</option>
                    <option value="cancelled">Annulé</option>
                    <option value="completed">Complété</option>
                </select>
            </div>

            {/* =================== Table =================== */}

            {loading && <div>Chargement…</div>}

            {error && (
                <div className="text-red-600">
                    {error.message}
                </div>
            )}

            {!loading && !error && appointments.length === 0 && (
                <div className="text-gray-500">
                    Aucun rendez-vous trouvé.
                </div>
            )}

            {!loading && appointments.length > 0 && (
                <div className="overflow-x-auto border rounded">
                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-100">
                        <tr>
                            <th className="p-2 text-left">Patient</th>
                            <th className="p-2 text-left">Spécialiste</th>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Heure</th>
                            <th className="p-2 text-left">Statut</th>
                            <th className="p-2 text-left">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {appointments.map((a) => {
                            const busy = !!busyIds[a._id];

                            return (
                                <tr
                                    key={a._id}
                                    className="border-t hover:bg-gray-50"
                                >
                                    <td className="p-2 font-mono">
                                        {a.patientInsuranceNumber}
                                    </td>
                                    <td className="p-2">
                                        {a.specialist}
                                    </td>
                                    <td className="p-2">{a.date}</td>
                                    <td className="p-2">{a.time}</td>
                                    <td className="p-2">{a.status}</td>
                                    <td className="p-2">
                                        <div className="flex gap-2">
                                            <button
                                                disabled={
                                                    busy ||
                                                    a.status !== "scheduled"
                                                }
                                                onClick={() =>
                                                    handleAction(a._id, () =>
                                                        cancelAppointment(a._id)
                                                    )
                                                }
                                                className="px-2 py-1 text-xs border rounded disabled:opacity-50"
                                            >
                                                Annuler
                                            </button>

                                            <button
                                                disabled={
                                                    busy ||
                                                    a.status !== "scheduled"
                                                }
                                                onClick={() =>
                                                    handleAction(a._id, () =>
                                                        updateAppointmentStatus(
                                                            a._id,
                                                            "completed"
                                                        )
                                                    )
                                                }
                                                className="px-2 py-1 text-xs border rounded disabled:opacity-50"
                                            >
                                                Compléter
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
