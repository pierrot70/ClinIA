import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    fetchAppointmentsPaginated,
    fetchAvailableSlots,
    fetchRescheduleRecommendation,
    rescheduleAppointment,
    requestSpecialistAvailability,
    fetchSpecialistAvailabilityRequests,
    resolveSpecialistAvailabilityRequest,
    type SpecialistAvailabilityRequest,
    updateAppointmentSchedule,
    updateAppointmentStatus,
    type Appointment,
    type AppointmentSortDirection,
    type AppointmentStatus,
} from "../services/appointmentsApi";
import {
    fetchSpecialistsPaginated,
    type Specialist,
} from "../services/specialistsApi";
import {
    fetchCliniquesPaginated,
    type Clinique,
} from "../services/cliniqueApi";
import type { ApiError } from "../types/api";
import type { WriteVerificationMeta } from "../types/api";
import {
    formatWriteVerificationMessage,
    WriteVerificationReceipt,
} from "../components/system/WriteVerificationReceipt";
import { labels } from "../i18n/uiLabels";
import { appointmentListLabel } from "../i18n/appointmentListLabels";
import { displaySpecialty } from "../i18n/specialtyLabels";
import { logSafeClientError } from "../utils/safeClientLog";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { useAuth } from "../hooks/useAuth";

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
    const { user } = useAuth();
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
    const [specialists, setSpecialists] = useState<Specialist[]>([]);
    const [cliniques, setCliniques] = useState<Clinique[]>([]);
    const [availabilityRequests, setAvailabilityRequests] = useState<SpecialistAvailabilityRequest[]>([]);
    const [availabilityRequestsError, setAvailabilityRequestsError] = useState("");
    const [resolvingAvailabilityRequestId, setResolvingAvailabilityRequestId] = useState<string | null>(null);

    /* ---------------- Edition horaire ---------------- */

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingPurpose, setEditingPurpose] = useState<"update" | "reschedule">("update");
    const [editDate, setEditDate] = useState("");
    const [editTime, setEditTime] = useState("");
    const [editSpecialist, setEditSpecialist] = useState("");
    const [editClinique, setEditClinique] = useState("");
    const [editOriginalClinique, setEditOriginalClinique] = useState("");
    const [editPatientId, setEditPatientId] = useState("");
    const [editOriginalDate, setEditOriginalDate] = useState("");
    const [editOriginalTime, setEditOriginalTime] = useState("");
    const [editSlots, setEditSlots] = useState<string[]>([]);
    const [editSlotsLoading, setEditSlotsLoading] = useState(false);
    const [editSlotsRefreshKey, setEditSlotsRefreshKey] = useState(0);
    const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<string | null>(
        null
    );
    const updatedTimerRef = useRef<number | null>(null);

    /* ---------------- Toasts ---------------- */

    const [toast, setToast] = useState<{
        type: "success" | "error" | "info";
        message: string;
    } | null>(null);
    const [lastWriteVerification, setLastWriteVerification] =
        useState<WriteVerificationMeta | null>(null);
    const toastTimerRef = useRef<number | null>(null);
    useEffect(() => {
        return () => {
            if (updatedTimerRef.current) {
                window.clearTimeout(updatedTimerRef.current);
            }
        };
    }, []);

    async function loadAvailabilityRequests() {
        if (user?.role !== "ADMIN" && user?.role !== "SUPERADMIN") return;
        const response = await fetchSpecialistAvailabilityRequests();
        if ("data" in response) {
            setAvailabilityRequests(response.data);
            setAvailabilityRequestsError("");
        } else {
            setAvailabilityRequestsError(response.error.message);
        }
    }

    useEffect(() => {
        void loadAvailabilityRequests();
    }, [user?.role]);

    async function handleResolveAvailabilityRequest(requestId: string) {
        setResolvingAvailabilityRequestId(requestId);
        setAvailabilityRequestsError("");

        const response = await resolveSpecialistAvailabilityRequest(requestId);
        if ("error" in response) {
            setAvailabilityRequestsError(response.error.message);
            setResolvingAvailabilityRequestId(null);
            return;
        }

        setAvailabilityRequests((current) =>
            current.filter((request) => request.id !== requestId)
        );
        showToast("success", "Demande de disponibilités marquée traitée.");
        setResolvingAvailabilityRequestId(null);
    }

    /* ---------------- Pagination ---------------- */

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 10;

    /* ---------------- Filtres ---------------- */

    const [ramq, setRamq] = useState("");
    const [specialist, setSpecialist] = useState("");
    const [clinique, setClinique] = useState("");
    const [status, setStatus] = useState<AppointmentStatus | "">("");
    const [sortDirection, setSortDirection] =
        useState<AppointmentSortDirection>("asc");

    const rawFilters = useMemo(
        () => ({ ramq, specialist, clinique, status, sortDirection }),
        [ramq, specialist, clinique, status, sortDirection]
    );

    const filters = useDebounce(rawFilters, 300);

    /* ---------------- Chargement ---------------- */

    useEffect(() => {
        loadAppointments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    useEffect(() => {
        let cancelled = false;

        async function loadAllCliniques() {
            const pageSize = 50;
            let currentPage = 1;
            let totalPages = 1;
            const all: Clinique[] = [];

            while (currentPage <= totalPages) {
                const response = await fetchCliniquesPaginated({
                    page: currentPage,
                    limit: pageSize,
                });

                if ("error" in response) break;

                all.push(...response.data.data);
                totalPages = Math.max(response.data.meta.totalPages || 1, 1);
                currentPage += 1;
            }

            if (!cancelled) {
                setCliniques(
                    all.sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
                );
            }
        }

        void loadAllCliniques();

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
                editDate,
                editPatientId,
                editClinique || undefined,
                editingId
            );

            if (!cancelled && "data" in response) {
                setEditSlots(response.data.slots);
            }

            if (!cancelled) {
                setEditSlotsLoading(false);
            }
        }

        loadEditSlots();

        return () => {
            cancelled = true;
        };
    }, [
        editingId,
        editSpecialist,
        editDate,
        editPatientId,
        editClinique,
        editSlotsRefreshKey,
    ]);

    async function loadAppointments() {
        setLoading(true);
        setError(null);

        const response = await fetchAppointmentsPaginated({
            page,
            limit,
            patientInsuranceNumber: filters.ramq || undefined,
            specialist: filters.specialist || undefined,
            clinique: filters.clinique || undefined,
            status: filters.status || undefined,
            sortDirection: filters.sortDirection,
        });

        if ("error" in response) {
            setError(response.error);
            setLoading(false);
            return;
        }

        if (!response.data || !response.data.meta) {
            logSafeClientError("APPOINTMENTS_RESPONSE_INVALID");
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

    const cliniqueLookup = useMemo(
        () => new Map(cliniques.map((item) => [item._id, item.nom])),
        [cliniques]
    );

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
        return appointment.patientName || "—";
    }

    function formatCliniqueName(appointment: Appointment) {
        if (!appointment.clinique) return "—";
        return cliniqueLookup.get(appointment.clinique) || "—";
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
        return list.length > 0
            ? list.map((specialty) => displaySpecialty(specialty, i18n.locale)).join(", ")
            : fallback || "—";
    }

    function showToast(
        type: "success" | "error" | "info",
        message: string,
        verification?: WriteVerificationMeta | null
    ) {
        setToast({
            type,
            message: formatWriteVerificationMessage(message, verification),
        });
        setLastWriteVerification(verification ?? null);
        if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
            setToast(null);
            setLastWriteVerification(null);
        }, 3000);
    }

    async function handleAction(
        id: string,
        action: () => Promise<any>,
        options?: {
            confirmMessage?: string;
            successMessage?: string;
            errorMessage?: (error: ApiError) => string;
            onError?: (error: ApiError) => void;
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
            options?.onError?.(response.error);
            showToast(
                "error",
                options?.errorMessage?.(response.error) ?? response.error.message
            );
            setBusyIds((p) => ({ ...p, [id]: false }));
            return false;
        }

        await loadAppointments();
        setBusyIds((p) => ({ ...p, [id]: false }));
        if (options?.successMessage) {
            showToast(
                "success",
                options.successMessage,
                response.meta.writeVerification ?? null
            );
        }
        return true;
    }

    function startEditing(appointment: Appointment) {
        setEditingPurpose("update");
        setEditingId(appointment._id);
        setEditDate(appointment.date);
        setEditTime(appointment.time);
        setEditSpecialist(appointment.specialist);
        setEditClinique(appointment.clinique ?? "");
        setEditOriginalClinique(appointment.clinique ?? "");
        setEditPatientId(appointment.patient ?? "");
        setEditOriginalDate(appointment.date);
        setEditOriginalTime(appointment.time);
        setEditSlots([]);
    }

    async function startRescheduling(appointment: Appointment) {
        startEditing(appointment);
        setEditingPurpose("reschedule");
        setEditTime("");

        const response = await fetchRescheduleRecommendation(appointment._id);
        if ("error" in response) {
            showToast("error", response.error.message);
            return;
        }

        if (!response.data) {
            return;
        }

        setEditDate(response.data.date);
        setEditClinique(response.data.clinique);
        setEditSlots(response.data.availableSlots);
    }

    function stopEditing() {
        setEditingId(null);
        setEditDate("");
        setEditTime("");
        setEditSpecialist("");
        setEditClinique("");
        setEditOriginalClinique("");
        setEditPatientId("");
        setEditOriginalDate("");
        setEditOriginalTime("");
        setEditSlots([]);
        setEditingPurpose("update");
    }

    async function handleSaveSchedule(id: string) {
        if (!editDate || !editTime) return;

        if (
            editDate === editOriginalDate &&
            editTime === editOriginalTime &&
            editClinique === editOriginalClinique
        ) {
            showToast(
                "info",
                "Aucune modification à enregistrer."
            );
            return;
        }

        const ok = await handleAction(
            id,
            () => editingPurpose === "reschedule"
                ? rescheduleAppointment(id, {
                    date: editDate,
                    time: editTime,
                    clinique: editClinique || undefined,
                })
                : updateAppointmentSchedule(id, {
                    date: editDate,
                    time: editTime,
                    clinique: editClinique || undefined,
                }),
            {
                confirmMessage: editingPurpose === "reschedule"
                    ? appointmentLabels.feedback.confirmRescheduled
                        .replace("{date}", editDate)
                        .replace("{time}", editTime)
                    : `Confirmer le déplacement du rendez-vous au ${editDate} à ${editTime} ?`,
                successMessage: editingPurpose === "reschedule"
                    ? appointmentLabels.feedback.rescheduled
                    : "Horaire du rendez-vous mis à jour.",
                errorMessage: (error) =>
                    ["SPECIALIST_ALREADY_BOOKED", "APPOINTMENT_CONFLICT"].includes(
                        error.code
                    )
                        ? labels.appointmentsList.edit.slotJustBooked
                        : error.message,
                onError: (error) => {
                    if (
                        ["SPECIALIST_ALREADY_BOOKED", "APPOINTMENT_CONFLICT"].includes(
                            error.code
                        )
                    ) {
                        setEditTime("");
                        setEditSlotsRefreshKey((value) => value + 1);
                    }
                },
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
        editDate === editOriginalDate &&
        editTime === editOriginalTime &&
        editClinique === editOriginalClinique;
    const isEditTimeAllowed =
        isEditTimeSameAsOriginal || editSlots.includes(editTime);
    const appointmentLabels = labels.appointmentsList;
    const overviewLabels = appointmentLabels.overview;
    const localize = (key: string, french: string) => appointmentListLabel(i18n.locale, key, french);
    const canManageSpecialistAvailability =
        user?.role === "ADMIN" || user?.role === "SUPERADMIN";

    function statusLabel(appointment: Appointment) {
        if (appointment.status === "awaiting_confirmation") return localize("awaitingConfirmation", appointmentLabels.statuses.awaitingConfirmation);
        if (appointment.status === "scheduled") return localize("scheduled", appointmentLabels.statuses.scheduled);
        if (appointment.status === "completed") return localize("completed", appointmentLabels.statuses.completed);
        if (appointment.status === "no_show") return localize("noShow", appointmentLabels.statuses.noShow);
        if (appointment.status === "rescheduled") return localize("rescheduled", appointmentLabels.statuses.rescheduled);
        return appointment.cancellationReason === "clinic_emergency"
            ? localize("cancelled", appointmentLabels.statuses.cancelledClinicEmergency)
            : localize("cancelled", appointmentLabels.statuses.cancelledPatient);
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            {toast && (
                <div
                    className={`fixed top-4 right-4 z-50 max-w-xl rounded shadow text-sm ${
                        toast.type === "success"
                            ? "bg-white text-gray-900 border border-green-200"
                            : toast.type === "error"
                            ? "bg-red-600 text-white px-4 py-2"
                            : "bg-gray-900 text-white px-4 py-2"
                    }`}
                    role="status"
                >
                    <div className={toast.type === "success" ? "px-4 py-2" : ""}>
                        {toast.message}
                    </div>
                    {toast.type === "success" && (
                        <div className="px-4 pb-3">
                            <WriteVerificationReceipt
                                verification={lastWriteVerification}
                                labels={labels.writeVerification}
                            />
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-between">
                <h1 className="text-2xl font-semibold">
                    {localize("title", overviewLabels.title)}
                </h1>

                <Link
                    to="/appointments"
                    className="px-3 py-1 border rounded hover:bg-gray-100"
                >
                    {localize("createAppointment", overviewLabels.createAppointment)}
                </Link>
            </div>

            {canManageSpecialistAvailability && (
                <section className="rounded border border-violet-300 bg-violet-50 p-4">
                    <h2 className="font-semibold text-violet-950">{localize("availabilityRequests", overviewLabels.availabilityRequests)}</h2>
                    <p className="mt-1 text-sm text-violet-900">{localize("availabilityDescription", overviewLabels.availabilityDescription)}</p>
                    {availabilityRequestsError && <p className="mt-2 text-sm text-red-700">{availabilityRequestsError}</p>}
                    {!availabilityRequestsError && availabilityRequests.length === 0 && <p className="mt-2 text-sm text-violet-900">Aucune demande en attente.</p>}
                    <div className="mt-3 space-y-2">
                        {availabilityRequests.map((request) => (
                            <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-white p-3 text-sm">
                                <span><strong>{request.specialist}</strong> — {request.clinique}</span>
                                <button
                                    className="rounded bg-violet-700 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={resolvingAvailabilityRequestId === request.id}
                                    onClick={() => void handleResolveAvailabilityRequest(request.id)}
                                >
                                    {resolvingAvailabilityRequestId === request.id
                                        ? localize("processing", overviewLabels.processing)
                                        : localize("markResolved", overviewLabels.markResolved)}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ---------------- Filtres ---------------- */}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    <option value="">{localize("allSpecialists", overviewLabels.allSpecialists)}</option>
                    {specialists.map((sp) => (
                        <option key={sp._id} value={sp._id}>
                            {`${sp.prenom} ${sp.nom}${
                                sp.specialite
                                    ? ` — ${displaySpecialty(sp.specialite, i18n.locale)}`
                                    : ""
                            }`}
                        </option>
                    ))}
                </select>

                <select
                    className="border rounded p-2"
                    value={clinique}
                    onChange={(e) => {
                        setPage(1);
                        setClinique(e.target.value);
                    }}
                >
                    <option value="">{localize("allClinics", appointmentLabels.filters.allClinics)}</option>
                    {cliniques.map((item) => (
                        <option key={item._id} value={item._id}>
                            {item.nom}
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
                    <option value="">{localize("allStatuses", labels.coordinationRequestsPage.allStatuses)}</option>
                    <option value="scheduled">{localize("scheduled", appointmentLabels.statuses.scheduled)}</option>
                    <option value="awaiting_confirmation">{localize("awaitingConfirmation", appointmentLabels.statuses.awaitingConfirmation)}</option>
                    <option value="cancelled">{localize("cancelled", "Annulé")}</option>
                    <option value="completed">{localize("completed", appointmentLabels.statuses.completed)}</option>
                    <option value="no_show">{localize("noShow", appointmentLabels.statuses.noShow)}</option>
                    <option value="rescheduled">{localize("rescheduled", appointmentLabels.statuses.rescheduled)}</option>
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
                            <th className="p-2">{localize("patient", overviewLabels.patient)}</th>
                            <th className="p-2">{localize("specialist", overviewLabels.specialist)}</th>
                            <th className="p-2">{localize("specialties", overviewLabels.specialties)}</th>
                            <th className="p-2">{localize("clinic", appointmentLabels.table.clinic)}</th>
                            <th className="p-2" aria-sort={sortDirection === "asc" ? "ascending" : "descending"}>
                                <button
                                    type="button"
                                    className="font-semibold hover:underline"
                                    onClick={() => {
                                        setPage(1);
                                        setSortDirection((current) =>
                                            current === "asc" ? "desc" : "asc"
                                        );
                                    }}
                                    title={
                                        sortDirection === "asc"
                                            ? localize("sortDateDescending", appointmentLabels.table.sortDateDescending)
                                            : localize("sortDateAscending", appointmentLabels.table.sortDateAscending)
                                    }
                                >
                                    {localize("date", overviewLabels.date)} {sortDirection === "asc" ? "↑" : "↓"}
                                </button>
                            </th>
                            <th className="p-2">{localize("time", overviewLabels.time)}</th>
                            <th className="p-2">{localize("status", overviewLabels.status)}</th>
                            <th className="p-2">{localize("actions", overviewLabels.actions)}</th>
                        </tr>
                        </thead>
                        <tbody>
                        {appointments.map((a) => {
                            const resolvedSpecialist = resolveSpecialist(
                                a.specialist
                            );
                            const canResolve = ["scheduled", "awaiting_confirmation"].includes(a.status);

                            return (
                            <tr
                                key={a._id}
                                className={`border-t ${
                                    a.status === "awaiting_confirmation"
                                        ? "bg-amber-100"
                                        : a.status === "scheduled"
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
                                        <select
                                            className="border rounded p-1"
                                            value={editClinique}
                                            aria-label={labels.appointmentsList.edit.clinicLabel}
                                            onChange={(event) => {
                                                setEditClinique(event.target.value);
                                                setEditTime("");
                                            }}
                                        >
                                            {(resolvedSpecialist?.practiceLocations?.length
                                                ? resolvedSpecialist.practiceLocations.map(
                                                      (location) => location.clinique
                                                  )
                                                : resolvedSpecialist?.clinique_associer
                                                  ? [resolvedSpecialist.clinique_associer]
                                                  : [editClinique]
                                            )
                                                .filter(Boolean)
                                                .map((clinicId) => (
                                                    <option key={clinicId} value={clinicId}>
                                                        {cliniqueLookup.get(clinicId) || "—"}
                                                    </option>
                                                ))}
                                        </select>
                                    ) : (
                                        formatCliniqueName(a)
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
                                                {labels.appointmentsList.edit.availableSlots}
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
                                                    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs font-medium text-amber-950">
                                                        {editingPurpose === "reschedule" ? (
                                                            <>
                                                                <span>
                                                                    {appointmentLabels.feedback.noAvailableRescheduleSlot
                                                                        .replace("{specialist}", formatSpecialistName(resolvedSpecialist))}
                                                                </span>
                                                                {canManageSpecialistAvailability ? (
                                                                    <Link
                                                                        to="/specialists"
                                                                        className="mt-2 inline-flex rounded border border-amber-600 bg-white px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                                                                    >
                                                                        {appointmentLabels.feedback.manageAvailability
                                                                            .replace("{specialist}", formatSpecialistName(resolvedSpecialist))}
                                                                    </Link>
                                                                ) : (
                                                                    <div className="mt-2">
                                                                        <span className="block">{appointmentLabels.feedback.requestAvailability}</span>
                                                                        <button
                                                                            type="button"
                                                                            disabled={busyIds[a._id]}
                                                                            className="mt-2 rounded bg-violet-700 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                                                                            onClick={() => {
                                                                                void handleAction(
                                                                                    a._id,
                                                                                    () => requestSpecialistAvailability(a._id),
                                                                                    { successMessage: appointmentLabels.feedback.availabilityRequestSent }
                                                                                ).then((sent) => {
                                                                                    if (sent) stopEditing();
                                                                                });
                                                                            }}
                                                                        >
                                                                            {appointmentLabels.feedback.sendAvailabilityRequest}
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span>Aucun créneau disponible pour cette date.</span>
                                                        )}
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
                                                    ? "animate-time-flash inline-block rounded px-1 py-0.5"
                                                    : ""
                                            }
                                        >
                                            {a.time}
                                        </span>
                                    )}
                                </td>
                                <td className="p-2">
                                    <span
                                        className={
                                            a.status === "awaiting_confirmation"
                                                ? "inline-flex rounded-full border border-amber-500 bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-950"
                                                : "inline-flex rounded-full px-2 py-1 text-xs font-medium text-gray-800"
                                        }
                                    >
                                        {statusLabel(a)}
                                    </span>
                                </td>
                                <td className="p-2 flex flex-wrap gap-2">
                                    {editingId === a._id ? (
                                        <>
                                            <button
                                                disabled={
                                                    busyIds[a._id] ||
                                                    (a.status !== "scheduled" && a.status !== "awaiting_confirmation") ||
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
                                                {editingPurpose === "reschedule"
                                                    ? appointmentLabels.actions.createRescheduled
                                                    : "Enregistrer"}
                                            </button>
                                            <button
                                                onClick={stopEditing}
                                            >
                                                Annuler
                                            </button>
                                        </>
                                    ) : canResolve ? (
                                        <>
                                            <button
                                                disabled={busyIds[a._id] || !canResolve}
                                                className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
                                                onClick={() =>
                                                    handleAction(
                                                        a._id,
                                                        () =>
                                                            updateAppointmentStatus(a._id, "completed"),
                                                        {
                                                            confirmMessage: appointmentLabels.feedback.confirmCompleted,
                                                            successMessage: appointmentLabels.feedback.completed,
                                                        }
                                                    )
                                                }
                                            >
                                                {localize("markCompleted", appointmentLabels.actions.markCompleted)}
                                            </button>

                                            <button
                                                disabled={busyIds[a._id] || !canResolve}
                                                className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-45"
                                                onClick={() => handleAction(a._id, () => updateAppointmentStatus(a._id, "no_show"), {
                                                    confirmMessage: appointmentLabels.feedback.confirmNoShow,
                                                    successMessage: appointmentLabels.feedback.noShow,
                                                })}
                                            >
                                                {localize("noShow", appointmentLabels.actions.markNoShow)}
                                            </button>

                                            <button
                                                disabled={busyIds[a._id] || !canResolve}
                                                className="rounded border border-red-400 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                                                onClick={() => handleAction(a._id, () => updateAppointmentStatus(a._id, "cancelled", "patient"), {
                                                    confirmMessage: appointmentLabels.feedback.confirmCancelledPatient,
                                                    successMessage: appointmentLabels.feedback.cancelledPatient,
                                                })}
                                            >
                                                {localize("cancelPatient", appointmentLabels.actions.cancelPatient)}
                                            </button>

                                            <button
                                                disabled={busyIds[a._id] || !canResolve}
                                                className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-45"
                                                onClick={() => handleAction(a._id, () => updateAppointmentStatus(a._id, "cancelled", "clinic_emergency"), {
                                                    confirmMessage: appointmentLabels.feedback.confirmCancelledClinicEmergency,
                                                    successMessage: appointmentLabels.feedback.cancelledClinicEmergency,
                                                })}
                                            >
                                                {localize("cancelClinicEmergency", appointmentLabels.actions.cancelClinicEmergency)}
                                            </button>

                                            <button
                                                disabled={busyIds[a._id] || a.status !== "awaiting_confirmation"}
                                                className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                                                onClick={() => void startRescheduling(a)}
                                            >
                                                {localize("reschedule", appointmentLabels.actions.reschedule)}
                                            </button>

                                            <button
                                                disabled={busyIds[a._id] || a.status !== "scheduled"}
                                                className="rounded border border-blue-500 bg-white px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
                                                onClick={() =>
                                                    startEditing(a)
                                                }
                                            >
                                                {localize("modifySchedule", labels.appointmentsList.edit.modifySchedule)}
                                            </button>
                                        </>
                                    ) : (
                                        <span className="text-xs text-gray-500">—</span>
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
