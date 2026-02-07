import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    fetchAppointmentsPaginated,
    cancelAppointment,
    fetchAvailableSlots,
    updateAppointmentSchedule,
    updateAppointmentStatus,
    type Appointment,
    type AppointmentStatus,
} from "../services/appointmentsApi";
import {
    fetchPatientsPaginated,
    type Patient,
} from "../services/patientsApi";
import {
    fetchSpecialistsPaginated,
    type Specialist,
} from "../services/specialistsApi";
import type { ApiError } from "../types/api";

/* ------------------------------------------------------------------ */
/* Hook debounce                                                       */
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
    const [patients, setPatients] = useState<Patient[]>([]);
    const [specialists, setSpecialists] = useState<Specialist[]>([]);

    /* ---------------- Edition horaire ---------------- */

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDate, setEditDate] = useState("");
    const [editTime, setEditTime] = useState("");
    const [editSpecialist, setEditSpecialist] = useState("");
    const [editOriginalDate, setEditOriginalDate] = useState("");
    const [editOriginalTime, setEditOriginalTime] = useState("");
    const [editSlots, setEditSlots] = useState<string[]>([]);
    const [editSlotsLoading, setEditSlotsLoading] = useState(false);
    const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<string | null>(
        null
    );
    const updatedTimerRef = useRef<number | null>(null);

    /* ---------------- Toasts ---------------- */

    const [toast, setToast] = useState<{
        type: "success" | "error" | "info";
        message: string;
    } | null>(null);
    const toastTimerRef = useRef<number | null>(null);
    useEffect(() => {
        return () => {
            if (updatedTimerRef.current) {
                window.clearTimeout(updatedTimerRef.current);
            }
        };
    }, []);

    /* ---------------- Pagination ---------------- */

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 10;

    /* ---------------- Filtres ---------------- */

    const [ramq, setRamq] = useState("");
    const [specialist, setSpecialist] = useState("");
    const [status, setStatus] = useState<AppointmentStatus | "">("");

    const rawFilters = useMemo(
        () => ({ ramq, specialist, status }),
        [ramq, specialist, status]
    );

    const filters = useDebounce(rawFilters, 300);

    /* ---------------- Chargement ---------------- */

    useEffect(() => {
        loadAppointments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    useEffect(() => {
        let cancelled = false;

        async function loadAllPatients() {
            const pageSize = 50;
            let currentPage = 1;
            let totalPages = 1;
            const all: Patient[] = [];

            while (currentPage <= totalPages) {
                const response = await fetchPatientsPaginated({
                    page: currentPage,
                    limit: pageSize,
                });

                if ("error" in response) {
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
                setPatients(all);
            }
        }

        loadAllPatients();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadAllSpecialists() {
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
            }
        }

        loadAllSpecialists();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!editingId || !editSpecialist || !editDate) {
            setEditSlots([]);
            return;
        }

        let cancelled = false;

        async function loadEditSlots() {
            setEditSlotsLoading(true);

            const response = await fetchAvailableSlots(
                editSpecialist,
                editDate
            );

            if (!cancelled && "data" in response) {
                setEditSlots(response.data);
            }

            if (!cancelled) {
                setEditSlotsLoading(false);
            }
        }

        loadEditSlots();

        return () => {
            cancelled = true;
        };
    }, [editingId, editSpecialist, editDate]);

    async function loadAppointments() {
        setLoading(true);
        setError(null);

        const response = await fetchAppointmentsPaginated({
            page,
            limit,
            patientInsuranceNumber: filters.ramq || undefined,
            specialist: filters.specialist || undefined,
            status: filters.status || undefined,
        });

        if ("error" in response) {
            setError(response.error);
            setLoading(false);
            return;
        }

        if (!response.data || !response.data.meta) {
            console.error("❌ Réponse invalide:", response);
            setError({
                code: "INTERNAL_ERROR",
                message:
                    "Réponse serveur invalide (pagination manquante).",
                retryable: false,
            });
            setLoading(false);
            return;
        }

        // ✅ CONTRAT CORRECT
        setAppointments(response.data.data);
        setTotalPages(response.data.meta.totalPages);

        setLoading(false);
    }

    const specialistLookup = useMemo(() => {
        const byId = new Map<string, Specialist>();
        const byNumero = new Map<string, Specialist>();
        const bySpecialite = new Map<string, Specialist[]>();

        specialists.forEach((sp) => {
            if (sp._id) {
                byId.set(sp._id, sp);
            }
            if (sp.numero_medecin) {
                byNumero.set(sp.numero_medecin, sp);
            }
            if (sp.specialite) {
                const key = sp.specialite;
                const existing = bySpecialite.get(key);
                if (existing) {
                    existing.push(sp);
                } else {
                    bySpecialite.set(key, [sp]);
                }
            }
        });

        return { byId, byNumero, bySpecialite };
    }, [specialists]);

    const patientLookup = useMemo(() => {
        const byId = new Map<string, Patient>();
        const byRamq = new Map<string, Patient>();

        patients.forEach((p) => {
            if (p._id) {
                byId.set(p._id, p);
            }
            if (p.num_assurance_maladie) {
                byRamq.set(p.num_assurance_maladie, p);
            }
        });

        return { byId, byRamq };
    }, [patients]);

    function resolveSpecialist(raw: string) {
        if (!raw) return null;

        const fromId = specialistLookup.byId.get(raw);
        if (fromId) return fromId;

        const fromNumero = specialistLookup.byNumero.get(raw);
        if (fromNumero) return fromNumero;

        const fromSpecialite = specialistLookup.bySpecialite.get(raw);
        if (fromSpecialite && fromSpecialite.length === 1) {
            return fromSpecialite[0];
        }

        return null;
    }

    function formatSpecialistName(specialist: Specialist | null) {
        if (!specialist) return "—";
        const label = `${specialist.prenom} ${specialist.nom}`.trim();
        return label || "—";
    }

    function formatPatientName(appointment: Appointment) {
        const byId = appointment.patient
            ? patientLookup.byId.get(appointment.patient)
            : undefined;
        const byRamq = appointment.patientInsuranceNumber
            ? patientLookup.byRamq.get(
                  appointment.patientInsuranceNumber
              )
            : undefined;
        const patient = byId || byRamq;
        if (!patient) return "—";
        const label = `${patient.prenom} ${patient.nom}`.trim();
        return label || "—";
    }

    function normalizeSpecialties(value: unknown) {
        if (Array.isArray(value)) {
            return value.map(String).map((item) => item.trim()).filter(Boolean);
        }
        if (typeof value === "string") {
            return value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
        }
        return [];
    }

    function formatSpecialties(
        specialist: Specialist | null,
        fallback: string
    ) {
        if (!specialist) return fallback || "—";
        const list = normalizeSpecialties(specialist.specialite);
        return list.length > 0 ? list.join(", ") : fallback || "—";
    }

    function showToast(
        type: "success" | "error" | "info",
        message: string
    ) {
        setToast({ type, message });
        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
            setToast(null);
        }, 3000);
    }

    async function handleAction(
        id: string,
        action: () => Promise<any>,
        options?: {
            confirmMessage?: string;
            successMessage?: string;
        }
    ): Promise<boolean> {
        if (options?.confirmMessage) {
            const confirmed = window.confirm(options.confirmMessage);
            if (!confirmed) {
                return false;
            }
        }

        setBusyIds((p) => ({ ...p, [id]: true }));
        setError(null);

        const response = await action();

        if ("error" in response) {
            setError(response.error);
            showToast("error", response.error.message);
            setBusyIds((p) => ({ ...p, [id]: false }));
            return false;
        }

        await loadAppointments();
        setBusyIds((p) => ({ ...p, [id]: false }));
        if (options?.successMessage) {
            showToast("success", options.successMessage);
        }
        return true;
    }

    function startEditing(appointment: Appointment) {
        setEditingId(appointment._id);
        setEditDate(appointment.date);
        setEditTime(appointment.time);
        setEditSpecialist(appointment.specialist);
        setEditOriginalDate(appointment.date);
        setEditOriginalTime(appointment.time);
        setEditSlots([]);
    }

    function stopEditing() {
        setEditingId(null);
        setEditDate("");
        setEditTime("");
        setEditSpecialist("");
        setEditOriginalDate("");
        setEditOriginalTime("");
        setEditSlots([]);
    }

    async function handleSaveSchedule(id: string) {
        if (!editDate || !editTime) return;

        if (
            editDate === editOriginalDate &&
            editTime === editOriginalTime
        ) {
            showToast(
                "info",
                "Aucune modification à enregistrer."
            );
            return;
        }

        const ok = await handleAction(
            id,
            () =>
                updateAppointmentSchedule(id, {
                    date: editDate,
                    time: editTime,
                }),
            {
                confirmMessage: `Confirmer le déplacement du rendez-vous au ${editDate} à ${editTime} ?`,
                successMessage:
                    "Horaire du rendez-vous mis à jour.",
            }
        );

        if (ok) {
            setRecentlyUpdatedId(id);
            if (updatedTimerRef.current) {
                window.clearTimeout(updatedTimerRef.current);
            }
            updatedTimerRef.current = window.setTimeout(() => {
                setRecentlyUpdatedId(null);
            }, 1600);
            stopEditing();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    const isEditFormComplete = Boolean(editDate && editTime);
    const isEditTimeSameAsOriginal =
        editDate === editOriginalDate && editTime === editOriginalTime;
    const isEditTimeAllowed =
        isEditTimeSameAsOriginal || editSlots.includes(editTime);

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            {toast && (
                <div
                    className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow text-sm ${
                        toast.type === "success"
                            ? "bg-green-600 text-white"
                            : toast.type === "error"
                            ? "bg-red-600 text-white"
                            : "bg-gray-900 text-white"
                    }`}
                    role="status"
                >
                    {toast.message}
                </div>
            )}

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

            {/* ---------------- Filtres ---------------- */}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                    className="border rounded p-2"
                    placeholder="RAMQ"
                    value={ramq}
                    onChange={(e) => {
                        setPage(1);
                        setRamq(e.target.value);
                    }}
                />

                <select
                    className="border rounded p-2"
                    value={specialist}
                    onChange={(e) => {
                        setPage(1);
                        setSpecialist(e.target.value);
                    }}
                >
                    <option value="">Tous les spécialistes</option>
                    {specialists.map((sp) => (
                        <option key={sp._id} value={sp._id}>
                            {`${sp.prenom} ${sp.nom}${
                                sp.specialite
                                    ? ` — ${sp.specialite}`
                                    : ""
                            }`}
                        </option>
                    ))}
                </select>

                <select
                    className="border rounded p-2"
                    value={status}
                    onChange={(e) => {
                        setPage(1);
                        setStatus(e.target.value as AppointmentStatus | "");
                    }}
                >
                    <option value="">Tous les statuts</option>
                    <option value="scheduled">Planifié</option>
                    <option value="cancelled">Annulé</option>
                    <option value="completed">Complété</option>
                </select>
            </div>

            {/* ---------------- Table ---------------- */}

            {loading && <div>Chargement…</div>}

            {error && (
                <div className="text-red-600">{error.message}</div>
            )}

            {!loading && appointments.length === 0 && (
                <div className="text-gray-500">
                    Aucun rendez-vous trouvé.
                </div>
            )}

            {!loading && appointments.length > 0 && (
                <>
                    <table className="w-full border text-sm">
                        <thead className="bg-gray-100">
                        <tr>
                            <th className="p-2">Patient</th>
                            <th className="p-2">Spécialiste</th>
                            <th className="p-2">Spécialités</th>
                            <th className="p-2">Date</th>
                            <th className="p-2">Heure</th>
                            <th className="p-2">Statut</th>
                            <th className="p-2">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {appointments.map((a) => {
                            const resolvedSpecialist = resolveSpecialist(
                                a.specialist
                            );

                            return (
                            <tr
                                key={a._id}
                                className={`border-t ${
                                    a.status === "scheduled"
                                        ? "bg-green-50"
                                        : a.status === "cancelled"
                                            ? "bg-red-50"
                                            : ""
                                }`}
                            >
                                <td className="p-2">
                                    {formatPatientName(a)}
                                </td>
                                <td className="p-2">
                                    {formatSpecialistName(
                                        resolvedSpecialist
                                    )}
                                </td>
                                <td className="p-2">
                                    {formatSpecialties(
                                        resolvedSpecialist,
                                        ""
                                    )}
                                </td>
                                <td className="p-2">
                                    {editingId === a._id ? (
                                        <input
                                            type="date"
                                            className="border rounded p-1"
                                            value={editDate}
                                            onChange={(e) =>
                                                setEditDate(
                                                    e.target.value
                                                )
                                            }
                                        />
                                    ) : (
                                        a.date
                                    )}
                                </td>
                                <td className="p-2">
                                    {editingId === a._id ? (
                                        <div className="space-y-2">
                                            <input
                                                type="time"
                                                className="border rounded p-1 w-full"
                                                value={editTime}
                                                onChange={(e) =>
                                                    setEditTime(
                                                        e.target.value
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-gray-500">
                                                Créneaux disponibles
                                            </div>
                                            {editSlotsLoading && (
                                                <div className="text-xs text-gray-400">
                                                    Chargement…
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {editSlots.map((slot) => (
                                                    <button
                                                        key={slot}
                                                        type="button"
                                                        onClick={() =>
                                                            setEditTime(
                                                                slot
                                                            )
                                                        }
                                                        className={`px-2 py-1 text-xs border rounded ${
                                                            slot ===
                                                            editTime
                                                                ? "bg-primary text-white"
                                                                : ""
                                                        }`}
                                                    >
                                                        {slot}
                                                    </button>
                                                ))}
                                            </div>
                                            {!editSlotsLoading &&
                                                editSlots.length === 0 && (
                                                    <div className="text-xs text-gray-400">
                                                        Aucun créneau disponible
                                                        pour cette date.
                                                    </div>
                                                )}
                                            {!isEditFormComplete && (
                                                <div className="text-xs text-amber-700">
                                                    Date et heure requises.
                                                </div>
                                            )}
                                            {isEditFormComplete &&
                                                !isEditTimeAllowed && (
                                                    <div className="text-xs text-red-600">
                                                        Ce créneau n&apos;est pas
                                                        disponible.
                                                    </div>
                                                )}
                                        </div>
                                    ) : (
                                        <span
                                            className={
                                                recentlyUpdatedId === a._id
                                                    ? "time-flash"
                                                    : ""
                                            }
                                        >
                                            {a.time}
                                        </span>
                                    )}
                                </td>
                                <td className="p-2">{a.status}</td>
                                <td
                                    className={`p-2 flex gap-2 ${
                                        a.status === "cancelled"
                                            ? "hidden"
                                            : ""
                                    }`}
                                >
                                    {editingId === a._id ? (
                                        <>
                                            <button
                                                disabled={
                                                    busyIds[a._id] ||
                                                    a.status !== "scheduled" ||
                                                    editSlotsLoading ||
                                                    !isEditFormComplete ||
                                                    !isEditTimeAllowed
                                                }
                                                onClick={() =>
                                                    handleSaveSchedule(
                                                        a._id
                                                    )
                                                }
                                                className="bg-lime-400 text-black px-2 py-1 rounded"
                                            >
                                                Enregistrer
                                            </button>
                                            <button
                                                onClick={stopEditing}
                                            >
                                                Annuler
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                disabled={
                                                    busyIds[a._id] ||
                                                    a.status !== "scheduled"
                                                }
                                                onClick={() =>
                                                    handleAction(
                                                        a._id,
                                                        () =>
                                                            cancelAppointment(
                                                                a._id
                                                            ),
                                                        {
                                                            confirmMessage:
                                                                "Confirmer l’annulation de ce rendez-vous ?",
                                                            successMessage:
                                                                "Rendez-vous annulé.",
                                                        }
                                                    )
                                                }
                                            >
                                                Annuler
                                            </button>

                                            <button
                                                disabled={
                                                    busyIds[a._id] ||
                                                    a.status !== "scheduled"
                                                }
                                                onClick={() =>
                                                    handleAction(
                                                        a._id,
                                                        () =>
                                                            updateAppointmentStatus(
                                                                a._id,
                                                                "completed"
                                                            ),
                                                        {
                                                            confirmMessage:
                                                                "Confirmer le passage à “Complété” ?",
                                                            successMessage:
                                                                "Rendez-vous complété.",
                                                        }
                                                    )
                                                }
                                            >
                                                Compléter
                                            </button>

                                            <button
                                                disabled={
                                                    busyIds[a._id] ||
                                                    a.status !== "scheduled"
                                                }
                                                onClick={() =>
                                                    startEditing(a)
                                                }
                                            >
                                                Modifier l’heure
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                            );
                        })}
                        </tbody>
                    </table>

                    {/* ---------------- Pagination ---------------- */}

                    <div className="flex justify-between items-center mt-4">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            ← Précédent
                        </button>

                        <span>
                            Page {page} / {totalPages}
                        </span>

                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Suivant →
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
