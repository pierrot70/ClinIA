import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAppointments } from "../services/appointmentsApi";
import type { ApiError } from "../types/api";

interface Appointment {
    _id: string;
    patientInsuranceNumber: string;
    specialist: string;
    date: string;
    time: string;
    status: "scheduled" | "cancelled" | "completed";
    priority?: "normal" | "urgent";
    reason?: string;
}

export function AppointmentsListPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<ApiError | null>(null);

    useEffect(() => {
        loadAppointments();
    }, []);

    async function loadAppointments() {
        setLoading(true);
        setError(null);

        const response = await fetchAppointments();

        if ("error" in response) {
            setError(response.error);
            setLoading(false);
            return;
        }

        setAppointments(response.data);
        setLoading(false);
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold">
                Tous les rendez-vous
            </h1>

            <div className="flex gap-4">
                <Link
                    to="/appointments"
                    className="px-3 py-1 border rounded hover:bg-gray-100"
                >
                    Créer un rendez-vous
                </Link>
            </div>

            {loading && (
                <div className="text-gray-500">
                    Chargement des rendez-vous…
                </div>
            )}

            {error && (
                <div className="text-red-600">
                    {error.message}
                </div>
            )}

            {!loading && appointments.length === 0 && (
                <div className="text-gray-500">
                    Aucun rendez-vous trouvé.
                </div>
            )}

            {!loading && appointments.length > 0 && (
                <div className="overflow-x-auto border rounded">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                        <tr>
                            <th className="p-2">Patient</th>
                            <th className="p-2">Spécialiste</th>
                            <th className="p-2">Date</th>
                            <th className="p-2">Heure</th>
                            <th className="p-2">Priorité</th>
                            <th className="p-2">Statut</th>
                        </tr>
                        </thead>
                        <tbody>
                        {appointments.map((a) => (
                            <tr
                                key={a._id}
                                className="border-t hover:bg-gray-50"
                            >
                                <td className="p-2 font-mono">
                                    {a.patientInsuranceNumber}
                                </td>
                                <td className="p-2">{a.specialist}</td>
                                <td className="p-2">{a.date}</td>
                                <td className="p-2">{a.time}</td>
                                <td className="p-2">
                                    {a.priority === "urgent" ? (
                                        <span className="text-red-600 font-semibold">
                                                Urgent
                                            </span>
                                    ) : (
                                        "Normal"
                                    )}
                                </td>
                                <td className="p-2">
                                    {a.status === "scheduled" && (
                                        <span className="text-green-600">
                                                Planifié
                                            </span>
                                    )}
                                    {a.status === "cancelled" && (
                                        <span className="text-gray-500">
                                                Annulé
                                            </span>
                                    )}
                                    {a.status === "completed" && (
                                        <span className="text-blue-600">
                                                Complété
                                            </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
