import { useEffect, useMemo, useRef, useState } from "react";
import {
    createSpecialist,
    deleteSpecialist,
    fetchSpecialistsPaginated,
    updateSpecialist,
    type Specialist,
    type SpecialistPayload,
} from "../services/specialistsApi";
import type { ApiError } from "../types/api";
import { useDebounce } from "../hooks/useDebounce";
import {
    Clinique,
    fetchCliniquesPaginated,
} from "../services/cliniqueApi";
import { SPECIALTIES } from "../data/specialties";

type DisponibiliteForm = {
    date: string; // YYYY-MM-DD
    slots: string[];
};

function padTime(value: number) {
    return String(value).padStart(2, "0");
}

const MONTH_OPTIONS = [
    { value: "01", label: "Janvier" },
    { value: "02", label: "Février" },
    { value: "03", label: "Mars" },
    { value: "04", label: "Avril" },
    { value: "05", label: "Mai" },
    { value: "06", label: "Juin" },
    { value: "07", label: "Juillet" },
    { value: "08", label: "Août" },
    { value: "09", label: "Septembre" },
    { value: "10", label: "Octobre" },
    { value: "11", label: "Novembre" },
    { value: "12", label: "Décembre" },
];

function formatDisponibilites(disponibilites?: string[]) {
    if (!disponibilites || disponibilites.length === 0) {
        return "—";
    }
    const parsed = disponibilites
        .map((slot) => new Date(slot))
        .filter((date) => !Number.isNaN(date.getTime()));

    if (parsed.length === 0) return "—";

    const grouped: Record<string, Date[]> = {};
    parsed.forEach((date) => {
        const key = `${date.getFullYear()}-${padTime(
            date.getMonth() + 1
        )}-${padTime(date.getDate())}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(date);
    });

    const dayLabels = Object.keys(grouped).sort();
    const formatted = dayLabels.map((day) => {
        const slots = grouped[day]
            .slice()
            .sort((a, b) => a.getTime() - b.getTime());
        if (slots.length === 0) return null;
        const first = slots[0];
        const last = slots[slots.length - 1];
        const end = new Date(last.getTime() + 15 * 60 * 1000);
        const startLabel = `${padTime(first.getHours())}:${padTime(
            first.getMinutes()
        )}`;
        const endLabel = `${padTime(end.getHours())}:${padTime(
            end.getMinutes()
        )}`;
        return `${day} ${startLabel}-${endLabel} (${slots.length})`;
    });

    return formatted.filter(Boolean).join(" · ");
}

function toLocalDateKey(date: Date) {
    return `${date.getFullYear()}-${padTime(date.getMonth() + 1)}-${padTime(
        date.getDate()
    )}`;
}

function nextQuarterHour(time: Date) {
    const rounded = new Date(time);
    const minutes = rounded.getMinutes();
    const next = Math.ceil((minutes + 1) / 15) * 15;
    rounded.setSeconds(0, 0);
    if (next >= 60) {
        rounded.setMinutes(0);
        rounded.setHours(rounded.getHours() + 1);
    } else {
        rounded.setMinutes(next);
    }
    return `${padTime(rounded.getHours())}:${padTime(
        rounded.getMinutes()
    )}`;
}

function buildTimeSlots() {
    const slots: string[] = [];
    for (let hour = 8; hour <= 18; hour += 1) {
        for (let minutes = 0; minutes < 60; minutes += 15) {
            slots.push(`${padTime(hour)}:${padTime(minutes)}`);
        }
    }
    return slots;
}

const TIME_SLOTS = buildTimeSlots();

export function SpecialistsPage() {
    const [specialists, setSpecialists] = useState<Specialist[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 10;


    const [cliniqueOptions, setCliniqueOptions] = useState<Clinique[]>([]);
    const cliniqueMap = useMemo(() => {
        const map: Record<string, Clinique> = {};
        cliniqueOptions.forEach((clinique) => {
            map[clinique._id] = clinique;
        });
        return map;
    }, [cliniqueOptions]);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const highlightTimeoutRef = useRef<
        ReturnType<typeof setTimeout> | null
    >(null);

    const [filterNom, setFilterNom] = useState("");
    const [filterPrenom, setFilterPrenom] = useState("");
    const [filterNumero, setFilterNumero] = useState("");
    const [filterClinique, setFilterClinique] = useState("");

    const rawFilters = useMemo(
        () => ({
            nom: filterNom,
            prenom: filterPrenom,
            numero_medecin: filterNumero,
            clinique_associer: filterClinique,
        }),
        [
            filterNom,
            filterPrenom,
            filterNumero,
            filterClinique,
        ]
    );

    const filters = useDebounce(rawFilters, 300);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({
        nom: "",
        prenom: "",
        numero_medecin: "",
        telephone: "",
        email: "",
        texto: false,
        clinique_associer: "",
        specialite: "",
        disponibilites: [] as DisponibiliteForm[],
    });
    const [monthKey, setMonthKey] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(
            now.getMonth() + 1
        ).padStart(2, "0")}`;
    });
    const [activeDay, setActiveDay] = useState<string | null>(null);
    const [lastClickedSlot, setLastClickedSlot] = useState<string | null>(
        null
    );
    const [viewMode, setViewMode] = useState<"create" | "list">("list");

    useEffect(() => {
        void loadSpecialists();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    useEffect(() => {
        setLastClickedSlot(null);
    }, [activeDay]);

    useEffect(() => {
        void loadCliniqueOptions();
    }, []);

    function getClinicContacts(clinicId?: string) {
        const clinic = clinicId ? cliniqueMap[clinicId] : undefined;
        return {
            telephone: clinic?.telephone ?? "",
            email: clinic?.courriel ?? "",
        };
    }

    async function loadSpecialists() {
        setLoading(true);
        setError(null);

        const response = await fetchSpecialistsPaginated({
            page,
            limit,
            nom: filters.nom || undefined,
            prenom: filters.prenom || undefined,
            numero_medecin: filters.numero_medecin || undefined,
            clinique_associer:
                filters.clinique_associer || undefined,
        });

        if ("error" in response) {
            setError(response.error);
            setLoading(false);
            return;
        }

        if (!response.data || !response.data.meta) {
            setError({
                code: "INTERNAL_ERROR",
                message:
                    "Réponse serveur invalide (pagination manquante).",
                retryable: false,
            });
            setLoading(false);
            return;
        }

        setSpecialists(response.data.data);
        setTotalPages(response.data.meta.totalPages);
        setLoading(false);
    }

    async function loadCliniqueOptions() {
        const response = await fetchCliniquesPaginated({
            page: 1,
            limit: 100,
        });

        if ("error" in response) {
            return;
        }

        setCliniqueOptions(response.data.data);
    }

    function highlightRow(id: string | null) {
        if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
        }

        setHighlightedId(id);

        if (id) {
            highlightTimeoutRef.current = window.setTimeout(() => {
                setHighlightedId(null);
                highlightTimeoutRef.current = null;
            }, 4000);
        }
    }

    useEffect(() => {
        return () => {
            if (highlightTimeoutRef.current) {
                clearTimeout(highlightTimeoutRef.current);
            }
        };
    }, []);

    function resetForm() {
        setEditingId(null);
        setForm({
            nom: "",
            prenom: "",
            numero_medecin: "",
            telephone: "",
            email: "",
            texto: false,
            clinique_associer: "",
            specialite: "",
            disponibilites: [],
        });
        const now = new Date();
        setMonthKey(
            `${now.getFullYear()}-${String(
                now.getMonth() + 1
            ).padStart(2, "0")}`
        );
        setActiveDay(null);
    }

    function handleCliniqueSelection(value: string) {
        const { telephone, email } = getClinicContacts(
            value || undefined
        );

        setForm((prev) => ({
            ...prev,
            clinique_associer: value,
            telephone,
            email,
        }));
    }

    function toPayload(
        values: typeof form
    ): { payload?: SpecialistPayload; error?: string } {
        const now = new Date();
        const slots: string[] = [];
        const seen = new Set<string>();

        for (const slot of values.disponibilites) {
            if (!slot.date || !slot.slots || slot.slots.length === 0) {
                return {
                    error:
                        "Chaque disponibilité doit contenir une date et au moins un créneau.",
                };
            }
            const [year, month, day] = slot.date
                .split("-")
                .map((value) => Number(value));
            if (
                Number.isNaN(year) ||
                Number.isNaN(month) ||
                Number.isNaN(day)
            ) {
                return {
                    error:
                        "Les dates de disponibilité doivent être valides.",
                };
            }
            for (const time of slot.slots) {
                const [hours, minutes] = time
                    .split(":")
                    .map((value) => Number(value));
                if (Number.isNaN(hours) || Number.isNaN(minutes)) {
                    return {
                        error:
                            "Les heures de disponibilité doivent être valides.",
                    };
                }
                if (minutes % 15 !== 0) {
                    return {
                        error:
                            "Les heures doivent être alignées sur 15 minutes.",
                    };
                }
                const start = new Date(
                    year,
                    month - 1,
                    day,
                    hours,
                    minutes,
                    0,
                    0
                );
                if (Number.isNaN(start.getTime())) {
                    return {
                        error:
                            "Les dates de disponibilité doivent être valides.",
                    };
                }
                if (start.getTime() < now.getTime()) {
                    return {
                        error:
                            "Les disponibilités ne peuvent pas être dans le passé.",
                    };
                }
                const iso = start.toISOString();
                if (seen.has(iso)) {
                    return {
                        error:
                            "Les disponibilités ne doivent pas se chevaucher.",
                    };
                }
                seen.add(iso);
                slots.push(iso);
            }
        }

        if (slots.length === 0 && values.disponibilites.length > 0) {
            return {
                error:
                    "Chaque disponibilité doit contenir au moins un créneau.",
            };
        }

        const ordered = slots.slice().sort();

        const payload: SpecialistPayload = {
            nom: values.nom.trim(),
            prenom: values.prenom.trim(),
            numero_medecin: values.numero_medecin.trim(),
            texto: values.texto,
            disponibilites: ordered,
        };

        if (values.telephone.trim()) {
            payload.telephone = values.telephone.trim();
        }
        if (values.email.trim()) {
            payload.email = values.email.trim();
        }
        if (values.clinique_associer.trim()) {
            payload.clinique_associer = values.clinique_associer.trim();
        } else if (values.clinique_associer === "") {
            payload.clinique_associer = undefined;
        }
        if (values.specialite.trim()) {
            payload.specialite = values.specialite.trim();
        } else if (values.specialite === "") {
            payload.specialite = undefined;
        }

        return { payload };
    }

    async function handleSubmit() {
        if (
            !form.nom.trim() ||
            !form.prenom.trim() ||
            !form.numero_medecin.trim()
        ) {
            setError({
                code: "INVALID_INPUT",
                message:
                    "Nom, prénom et numéro de médecin sont requis.",
                retryable: false,
            });
            return;
        }

        setError(null);

        const { payload, error: disponibiliteError } = toPayload(
            form
        );
        if (!payload) {
            setError({
                code: "INVALID_INPUT",
                message:
                    disponibiliteError ??
                    "Disponibilités invalides.",
                retryable: false,
            });
            return;
        }

        if (editingId) {
            const response = await updateSpecialist(
                editingId,
                payload
            );
            if ("error" in response) {
                setError(response.error);
                return;
            }
            const savedId =
                response.data?._id ?? editingId;
            highlightRow(savedId);
        } else {
            const response = await createSpecialist(payload);
            if ("error" in response) {
                setError(response.error);
                return;
            }
            const savedId = response.data?._id ?? null;
            highlightRow(savedId);
        }

        resetForm();
        await loadSpecialists();
    }

    async function handleEdit(specialist: Specialist) {
        setViewMode("create");
        setEditingId(specialist._id);
        // clinic_associer peut être string | null | undefined
        let clinicId: string = "";
        if (typeof specialist.clinique_associer === "string") {
            clinicId = specialist.clinique_associer;
        } else if (
            specialist.clinique_associer !== null &&
            specialist.clinique_associer !== undefined
        ) {
            clinicId = String(specialist.clinique_associer);
        }
        const clinicContacts = getClinicContacts(clinicId || undefined);
        const telephoneValue =
            clinicContacts.telephone || specialist.telephone || "";
        const emailValue = clinicContacts.email || specialist.email || "";
        const slots = (specialist.disponibilites ?? [])
            .map((slot) => new Date(slot))
            .filter((date) => !Number.isNaN(date.getTime()))
            .sort((a, b) => a.getTime() - b.getTime());
        const baseMonthKey =
            slots.length > 0
                ? `${slots[0].getFullYear()}-${String(
                      slots[0].getMonth() + 1
                  ).padStart(2, "0")}`
                : monthKey;
        const grouped: Record<string, Date[]> = {};
        slots.forEach((date) => {
            const key = `${date.getFullYear()}-${String(
                date.getMonth() + 1
            ).padStart(2, "0")}-${String(date.getDate()).padStart(
                2,
                "0"
            )}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(date);
        });
        const disponibilites = Object.keys(grouped)
            .filter((key) => key.startsWith(baseMonthKey))
            .sort()
            .map((key) => {
                const daySlots = grouped[key].sort(
                    (a, b) => a.getTime() - b.getTime()
                );
                return {
                    date: key,
                    slots: daySlots.map(
                        (slot) =>
                            `${padTime(slot.getHours())}:${padTime(
                                slot.getMinutes()
                            )}`
                    ),
                };
            });
        setMonthKey(baseMonthKey);
        setForm({
            nom: specialist.nom ?? "",
            prenom: specialist.prenom ?? "",
            numero_medecin: specialist.numero_medecin ?? "",
            telephone: telephoneValue,
            email: emailValue,
            texto: Boolean(specialist.texto),
            clinique_associer: clinicId,
            specialite: specialist.specialite ?? "",
            disponibilites,
        });
    }

    async function handleDelete(id: string) {
        const confirmed = window.confirm(
            "Supprimer ce spécialiste définitivement ?"
        );
        if (!confirmed) return;

        setBusyIds((p) => ({ ...p, [id]: true }));
        setError(null);

        const response = await deleteSpecialist(id);
        if ("error" in response) {
            setError(response.error);
            setBusyIds((p) => ({ ...p, [id]: false }));
            return;
        }

        setBusyIds((p) => ({ ...p, [id]: false }));
        await loadSpecialists();
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Spécialistes</h1>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className={`px-4 py-2 rounded border font-semibold transition ${
                        viewMode === "create"
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => setViewMode("create")}
                >
                    Créer un spécialiste
                </button>
                <button
                    type="button"
                    className={`px-4 py-2 rounded border font-semibold transition ${
                        viewMode === "list"
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => setViewMode("list")}
                >
                    Rechercher les spécialistes
                </button>
            </div>

            {error && (
                <div className="text-sm text-red-600">
                    {error.message}
                </div>
            )}

            {viewMode === "create" && (
                <div
                    className={`grid grid-cols-1 gap-4 border rounded p-4 transition duration-150 ${
                        editingId
                            ? "bg-gradient-to-r from-yellow-50 via-white to-white border-yellow-300 shadow-sm"
                            : "bg-gray-50 border-gray-200"
                    }`}
                >
                    <div className="text-sm font-medium">
                        {editingId
                            ? "Modifier un spécialiste"
                            : "Créer un spécialiste"}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            className="border rounded p-2"
                            placeholder="Prénom *"
                            value={form.prenom}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    prenom: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder="Nom *"
                            value={form.nom}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    nom: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder="Numéro de médecin *"
                            value={form.numero_medecin}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    numero_medecin: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2 bg-gray-50"
                            placeholder="Téléphone (automatique)"
                            value={form.telephone}
                            readOnly
                        />
                        <input
                            className="border rounded p-2 bg-gray-50"
                            placeholder="Courriel (automatique)"
                            value={form.email}
                            readOnly
                        />
                        <select
                            className="border rounded p-2"
                            value={form.clinique_associer}
                            onChange={(event) =>
                                handleCliniqueSelection(
                                    event.target.value
                                )
                            }
                        >
                            <option value="">Aucune clinique</option>
                            {cliniqueOptions.map((clinique) => (
                                <option
                                    key={clinique._id}
                                    value={clinique._id}
                                >
                                    {clinique.nom}{" "}
                                    {clinique.rue &&
                                        `(${clinique.rue})`}
                                </option>
                            ))}
                        </select>
                        <select
                            className="border rounded p-2"
                            value={form.specialite}
                            onChange={(event) =>
                                setForm((p) => ({
                                    ...p,
                                    specialite: event.target.value,
                                }))
                            }
                        >
                            <option value="">Aucune spécialité</option>
                            {SPECIALTIES.map((specialite) => (
                                <option
                                    key={specialite}
                                    value={specialite}
                                >
                                    {specialite}
                                </option>
                            ))}
                        </select>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.texto}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    texto: e.target.checked,
                                }))
                            }
                        />
                        SMS activé
                    </label>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">
                            Disponibilités (jours du mois)
                        </div>
                        <div className="grid gap-3 md:grid-cols-[200px_1fr] items-start">
                            <div className="space-y-2">
                                <label className="text-xs text-gray-600">
                                    Mois ciblé
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        className="border rounded p-2 w-full"
                                        value={monthKey.split("-")[1]}
                                        onChange={(event) => {
                                            const nextMonth =
                                                event.target.value;
                                            const year =
                                                monthKey.split("-")[0];
                                            setMonthKey(
                                                `${year}-${nextMonth}`
                                            );
                                            setForm((p) => ({
                                                ...p,
                                                disponibilites: [],
                                            }));
                                        }}
                                    >
                                        {MONTH_OPTIONS.map((option) => (
                                            <option
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        className="border rounded p-2 w-full"
                                        value={monthKey.split("-")[0]}
                                        onChange={(event) => {
                                            const nextYear =
                                                event.target.value;
                                            const month =
                                                monthKey.split("-")[1];
                                            setMonthKey(
                                                `${nextYear}-${month}`
                                            );
                                            setForm((p) => ({
                                                ...p,
                                                disponibilites: [],
                                            }));
                                        }}
                                    >
                                        {Array.from(
                                            { length: 6 },
                                            (_, i) =>
                                                String(
                                                    new Date().getFullYear() -
                                                        1 +
                                                        i
                                                )
                                        ).map((year) => (
                                            <option
                                                key={year}
                                                value={year}
                                            >
                                                {year}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="text-xs text-gray-500">
                                    Sélectionnez les jours à activer.
                                </div>
                            </div>
                            <div className="grid grid-cols-7 gap-2">
                                {(() => {
                                    const [yearStr, monthStr] =
                                        monthKey.split("-");
                                    const year = Number(yearStr);
                                    const month = Number(monthStr);
                                    const now = new Date();
                                    const todayKey = toLocalDateKey(now);
                                    if (
                                        Number.isNaN(year) ||
                                        Number.isNaN(month)
                                    ) {
                                        return null;
                                    }
                                    const firstDay = new Date(
                                        year,
                                        month - 1,
                                        1
                                    );
                                    const startOffset =
                                        (firstDay.getDay() + 6) % 7;
                                    const daysInMonth = new Date(
                                        year,
                                        month,
                                        0
                                    ).getDate();
                                    const blanks = Array.from(
                                        { length: startOffset },
                                        (_, i) => (
                                            <div key={`b-${i}`} />
                                        )
                                    );
                                    const days = Array.from(
                                        { length: daysInMonth },
                                        (_, i) => {
                                            const day = i + 1;
                                            const dateKey = `${year}-${String(
                                                month
                                            ).padStart(2, "0")}-${String(
                                                day
                                            ).padStart(2, "0")}`;
                                            const isPastDay =
                                                dateKey < todayKey;
                                            const selected =
                                                form.disponibilites.some(
                                                    (d) =>
                                                        d.date === dateKey
                                                );
                                            return (
                                                <button
                                                    key={dateKey}
                                                    type="button"
                                                    className={`rounded border px-2 py-1 text-sm ${
                                                        selected
                                                            ? "bg-primary text-white border-primary"
                                                            : "bg-white text-gray-700 border-gray-200"
                                                    } ${
                                                        isPastDay
                                                            ? "opacity-40 cursor-not-allowed"
                                                            : ""
                                                    }`}
                                                    disabled={isPastDay}
                                                    onClick={() => {
                                                        setForm((p) => {
                                                            const exists =
                                                                p.disponibilites.some(
                                                                    (d) =>
                                                                        d.date ===
                                                                        dateKey
                                                                );
                                                            setActiveDay(
                                                                dateKey
                                                            );
                                                            return {
                                                                ...p,
                                                                disponibilites: exists
                                                                    ? p.disponibilites.filter(
                                                                          (
                                                                              d
                                                                          ) =>
                                                                              d.date !==
                                                                              dateKey
                                                                      )
                                                                    : [
                                                                          ...p.disponibilites,
                                                                          {
                                                                              date: dateKey,
                                                                              slots: [],
                                                                          },
                                                                      ],
                                                            };
                                                        });
                                                    }}
                                                >
                                                    {day}
                                                </button>
                                            );
                                        }
                                    );
                                    return [...blanks, ...days];
                                })()}
                            </div>
                        </div>
                        {form.disponibilites.length === 0 && (
                            <div className="text-xs text-gray-500">
                                Aucun jour sélectionné.
                            </div>
                        )}
                        {activeDay &&
                            form.disponibilites.some(
                                (d) => d.date === activeDay
                            ) && (
                                <div className="border rounded p-3 bg-white space-y-2">
                                    <div className="text-sm font-medium">
                                        Choisir une plage pour{" "}
                                        {activeDay}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Cliquez pour activer/désactiver les
                                        créneaux de 15 minutes (shift pour
                                        une plage).
                                    </div>
                                    <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                                        {TIME_SLOTS.map((slot) => {
                                            const now = new Date();
                                            const minToday =
                                                nextQuarterHour(now);
                                            const isToday =
                                                activeDay ===
                                                toLocalDateKey(now);
                                            const isPastSlot =
                                                isToday &&
                                                slot < minToday;
                                            const isSelected =
                                                form.disponibilites
                                                    .find(
                                                        (d) =>
                                                            d.date ===
                                                            activeDay
                                                    )
                                                    ?.slots.includes(slot) ??
                                                false;
                                            return (
                                                <button
                                                    key={slot}
                                                    type="button"
                                                    disabled={isPastSlot}
                                                    className={`border rounded px-2 py-1 text-xs ${
                                                        isSelected
                                                            ? "bg-primary text-white border-primary"
                                                            : "bg-white text-gray-700 border-gray-200"
                                                    } ${
                                                        isPastSlot
                                                            ? "opacity-40 cursor-not-allowed"
                                                            : ""
                                                    }`}
                                                    onClick={(event) => {
                                                        const range =
                                                            lastClickedSlot &&
                                                            event.shiftKey
                                                                ? (() => {
                                                                      const startIndex =
                                                                          TIME_SLOTS.indexOf(
                                                                              lastClickedSlot
                                                                          );
                                                                      const endIndex =
                                                                          TIME_SLOTS.indexOf(
                                                                              slot
                                                                          );
                                                                      if (
                                                                          startIndex ===
                                                                              -1 ||
                                                                          endIndex ===
                                                                              -1
                                                                      ) {
                                                                          return [
                                                                              slot,
                                                                          ];
                                                                      }
                                                                      const from =
                                                                          Math.min(
                                                                              startIndex,
                                                                              endIndex
                                                                          );
                                                                      const to =
                                                                          Math.max(
                                                                              startIndex,
                                                                              endIndex
                                                                          );
                                                                      return TIME_SLOTS.slice(
                                                                          from,
                                                                          to +
                                                                              1
                                                                      );
                                                                  })()
                                                                : null;
                                                        setForm((p) => ({
                                                            ...p,
                                                            disponibilites:
                                                                p.disponibilites.map(
                                                                    (
                                                                        current
                                                                    ) =>
                                                                        current.date ===
                                                                        activeDay
                                                                            ? {
                                                                                  ...current,
                                                                                  slots: range
                                                                                      ? Array.from(
                                                                                            new Set(
                                                                                                [
                                                                                                    ...current.slots,
                                                                                                    ...range,
                                                                                                ]
                                                                                            )
                                                                                        )
                                                                                      : current.slots.includes(
                                                                                            slot
                                                                                        )
                                                                                          ? current.slots.filter(
                                                                                                (
                                                                                                    item
                                                                                                ) =>
                                                                                                    item !==
                                                                                                    slot
                                                                                            )
                                                                                          : [
                                                                                                ...current.slots,
                                                                                                slot,
                                                                                            ],
                                                                              }
                                                                            : current
                                                                ),
                                                        }));
                                                        setLastClickedSlot(
                                                            slot
                                                        );
                                                    }}
                                                >
                                                    {slot}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Cliquez plusieurs créneaux pour créer
                                        une liste (ex: 14:45, 16:15).
                                    </div>
                                </div>
                            )}
                        {form.disponibilites
                            .slice()
                            .sort((a, b) =>
                                a.date.localeCompare(b.date)
                            )
                            .map((slot) => (
                                <div
                                    key={slot.date}
                                    className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center"
                                >
                                    <div className="text-sm font-medium">
                                        {slot.date}
                                    </div>
                                    <div className="text-sm text-gray-700">
                                        {slot.slots.length > 0
                                            ? slot.slots
                                                  .slice()
                                                  .sort()
                                                  .join(", ")
                                            : "Aucun créneau"}
                                        <button
                                            type="button"
                                            className="ml-2 text-xs text-primary underline"
                                            onClick={() => {
                                                setActiveDay(slot.date);
                                            }}
                                        >
                                            Modifier
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="px-3 py-2 border rounded text-red-600"
                                        onClick={() =>
                                            setForm((p) => ({
                                                ...p,
                                                disponibilites:
                                                    p.disponibilites.filter(
                                                        (current) =>
                                                            current.date !==
                                                            slot.date
                                                    ),
                                            }))
                                        }
                                    >
                                        Retirer
                                    </button>
                                </div>
                            ))}
                        <div className="text-xs text-gray-500">
                            Les créneaux sont générés par pas de 15
                            minutes et sauvegardés en ISO.
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleSubmit}
                            className="px-4 py-2 bg-primary text-white rounded"
                        >
                            {editingId ? "Enregistrer" : "Créer"}
                        </button>
                        {editingId && (
                            <button
                                onClick={resetForm}
                                className="px-4 py-2 border rounded"
                            >
                                Annuler
                            </button>
                        )}
                    </div>
                </div>
            )}

            {viewMode === "list" && (
                <div className="space-y-4">
                    <div className="border rounded p-4 space-y-3">
                        <div className="text-sm font-medium">
                            Recherche
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                                className="border rounded p-2"
                                placeholder="Nom"
                                value={filterNom}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterNom(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder="Prénom"
                                value={filterPrenom}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterPrenom(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder="Numéro de médecin"
                                value={filterNumero}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterNumero(e.target.value);
                                }}
                            />
                            <select
                                className="border rounded p-2"
                                value={filterClinique}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterClinique(e.target.value);
                                }}
                            >
                                <option value="">
                                    Toutes les cliniques
                                </option>
                                {cliniqueOptions.map((clinique) => (
                                    <option
                                        key={clinique._id}
                                        value={clinique._id}
                                    >
                                        {clinique.nom}
                                        {clinique.rue &&
                                            ` (${clinique.rue})`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="border rounded overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100 text-gray-700">
                        <tr>
                            <th className="text-left p-2">
                                Nom
                            </th>
                            <th className="text-left p-2">
                                Prénom
                            </th>
                            <th className="text-left p-2">
                                Numéro médecin
                            </th>
                            <th className="text-left p-2">
                                Spécialité
                            </th>
                            <th className="text-left p-2">
                                Clinique
                            </th>
                            <th className="text-left p-2">
                                Téléphone
                            </th>
                            <th className="text-left p-2">
                                Courriel
                            </th>
                            <th className="text-left p-2">
                                Disponibilités
                            </th>
                            <th className="text-left p-2">
                                Actions
                            </th>
                        </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td
                                            className="p-2 text-gray-500"
                                            colSpan={9}
                                        >
                                            Chargement…
                                        </td>
                                    </tr>
                                )}
                                {!loading &&
                                    specialists.length === 0 && (
                                        <tr>
                                            <td
                                                className="p-2 text-gray-500"
                                                colSpan={9}
                                            >
                                                Aucun spécialiste
                                                trouvé.
                                            </td>
                                        </tr>
                                    )}
                                {!loading &&
                                    specialists.map((sp) => {
                                        const isRowHighlighted =
                                            highlightedId === sp._id;
                                        const associatedClinique = sp.clinique_associer
                                            ? cliniqueMap[
                                                  sp.clinique_associer
                                              ]
                                            : undefined;
                                        const specialtyLabel =
                                            sp.specialite?.trim() || "—";
                                        const clinicLabel =
                                            associatedClinique?.nom ||
                                            "—";
                                        const clinicTelephone =
                                            associatedClinique?.telephone ||
                                            "—";
                                        const clinicCourriel =
                                            associatedClinique?.courriel ||
                                            "—";
                                        const disponibilitesLabel =
                                            formatDisponibilites(
                                                sp.disponibilites
                                            );

                                        return (
                                            <tr
                                                key={sp._id}
                                                className={`border-t ${
                                                    isRowHighlighted
                                                        ? "bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-200 shadow-inner"
                                                        : ""
                                                }`}
                                            >
                                                <td className="p-2">
                                                    {sp.nom}
                                                </td>
                                                <td className="p-2">
                                                    {sp.prenom}
                                                </td>
                                                <td className="p-2">
                                                    {sp.numero_medecin}
                                                </td>
                                                <td className="p-2">
                                                    {specialtyLabel}
                                                </td>
                                                <td className="p-2">
                                                    {clinicLabel}
                                                </td>
                                                <td className="p-2">
                                                    {clinicTelephone}
                                                </td>
                                                <td className="p-2">
                                                    {clinicCourriel}
                                                </td>
                                                <td className="p-2">
                                                    {disponibilitesLabel}
                                                </td>
                                                <td className="p-2 flex gap-2">
                                                    <button
                                                        className="px-2 py-1 border rounded"
                                                        type="button"
                                                        onClick={() =>
                                                            handleEdit(sp)
                                                        }
                                                    >
                                                        Éditer
                                                    </button>
                                                    <button
                                                        className="px-2 py-1 border rounded text-red-600"
                                                        type="button"
                                                        disabled={
                                                            busyIds[
                                                                sp._id
                                                            ]
                                                        }
                                                        onClick={() =>
                                                            handleDelete(
                                                                sp._id
                                                            )
                                                        }
                                                    >
                                                        Supprimer
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            className="px-3 py-1 border rounded"
                            disabled={page <= 1}
                            onClick={() =>
                                setPage((p) => Math.max(p - 1, 1))
                            }
                        >
                            Précédent
                        </button>
                        <span className="text-sm text-gray-600">
                            Page {page} / {totalPages}
                        </span>
                        <button
                            className="px-3 py-1 border rounded"
                            disabled={page >= totalPages}
                            onClick={() =>
                                setPage((p) =>
                                    Math.min(p + 1, totalPages)
                                )
                            }
                        >
                            Suivant
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
