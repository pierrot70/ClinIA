import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { useTranslation } from "../hooks/useTranslation";
import { labels } from "../i18n/uiLabels";
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

function useSpecialistsPageLabels(targetLang: string) {
    const source = labels.specialistsPage;
    const options = { targetLang, namespace: "specialists-page" };

    const { translated: title } = useTranslation({ text: source.title, ...options });
    const { translated: createTab } = useTranslation({ text: source.tabs.create, ...options });
    const { translated: searchTab } = useTranslation({ text: source.tabs.search, ...options });
    const { translated: invalidServerResponse } = useTranslation({ text: source.validation.invalidServerResponse, ...options });
    const { translated: availabilityRequiresDateAndSlot } = useTranslation({ text: source.validation.availabilityRequiresDateAndSlot, ...options });
    const { translated: invalidAvailabilityDates } = useTranslation({ text: source.validation.invalidAvailabilityDates, ...options });
    const { translated: invalidAvailabilityHours } = useTranslation({ text: source.validation.invalidAvailabilityHours, ...options });
    const { translated: invalidAvailabilityAlignment } = useTranslation({ text: source.validation.invalidAvailabilityAlignment, ...options });
    const { translated: availabilityInPast } = useTranslation({ text: source.validation.availabilityInPast, ...options });
    const { translated: overlappingAvailability } = useTranslation({ text: source.validation.overlappingAvailability, ...options });
    const { translated: availabilityRequiresSlot } = useTranslation({ text: source.validation.availabilityRequiresSlot, ...options });
    const { translated: requiredIdentity } = useTranslation({ text: source.validation.requiredIdentity, ...options });
    const { translated: invalidAvailability } = useTranslation({ text: source.validation.invalidAvailability, ...options });
    const { translated: deleteConfirm } = useTranslation({ text: source.validation.deleteConfirm, ...options });
    const { translated: editTitle } = useTranslation({ text: source.form.editTitle, ...options });
    const { translated: createTitle } = useTranslation({ text: source.form.createTitle, ...options });
    const { translated: firstNamePlaceholder } = useTranslation({ text: source.form.firstNamePlaceholder, ...options });
    const { translated: lastNamePlaceholder } = useTranslation({ text: source.form.lastNamePlaceholder, ...options });
    const { translated: doctorNumberPlaceholder } = useTranslation({ text: source.form.doctorNumberPlaceholder, ...options });
    const { translated: phonePlaceholder } = useTranslation({ text: source.form.phonePlaceholder, ...options });
    const { translated: emailPlaceholder } = useTranslation({ text: source.form.emailPlaceholder, ...options });
    const { translated: noClinic } = useTranslation({ text: source.form.noClinic, ...options });
    const { translated: noSpecialty } = useTranslation({ text: source.form.noSpecialty, ...options });
    const { translated: smsEnabled } = useTranslation({ text: source.form.smsEnabled, ...options });
    const { translated: availabilityTitle } = useTranslation({ text: source.form.availabilityTitle, ...options });
    const { translated: targetMonth } = useTranslation({ text: source.form.targetMonth, ...options });
    const { translated: selectDaysHint } = useTranslation({ text: source.form.selectDaysHint, ...options });
    const { translated: noDaySelected } = useTranslation({ text: source.form.noDaySelected, ...options });
    const { translated: chooseRangePrefix } = useTranslation({ text: source.form.chooseRangePrefix, ...options });
    const { translated: slotHelp } = useTranslation({ text: source.form.slotHelp, ...options });
    const { translated: multipleSlotsHint } = useTranslation({ text: source.form.multipleSlotsHint, ...options });
    const { translated: noSlot } = useTranslation({ text: source.form.noSlot, ...options });
    const { translated: editSlot } = useTranslation({ text: source.form.editSlot, ...options });
    const { translated: removeDay } = useTranslation({ text: source.form.removeDay, ...options });
    const { translated: isoHint } = useTranslation({ text: source.form.isoHint, ...options });
    const { translated: save } = useTranslation({ text: source.form.save, ...options });
    const { translated: create } = useTranslation({ text: source.form.create, ...options });
    const { translated: cancel } = useTranslation({ text: source.form.cancel, ...options });
    const { translated: searchTitle } = useTranslation({ text: source.search.title, ...options });
    const { translated: searchLastNamePlaceholder } = useTranslation({ text: source.search.lastNamePlaceholder, ...options });
    const { translated: searchFirstNamePlaceholder } = useTranslation({ text: source.search.firstNamePlaceholder, ...options });
    const { translated: searchDoctorNumberPlaceholder } = useTranslation({ text: source.search.doctorNumberPlaceholder, ...options });
    const { translated: allClinics } = useTranslation({ text: source.search.allClinics, ...options });
    const { translated: tableLastName } = useTranslation({ text: source.table.lastName, ...options });
    const { translated: tableFirstName } = useTranslation({ text: source.table.firstName, ...options });
    const { translated: tableDoctorNumber } = useTranslation({ text: source.table.doctorNumber, ...options });
    const { translated: tableSpecialty } = useTranslation({ text: source.table.specialty, ...options });
    const { translated: tableClinic } = useTranslation({ text: source.table.clinic, ...options });
    const { translated: tablePhone } = useTranslation({ text: source.table.phone, ...options });
    const { translated: tableEmail } = useTranslation({ text: source.table.email, ...options });
    const { translated: tableAvailability } = useTranslation({ text: source.table.availability, ...options });
    const { translated: tableActions } = useTranslation({ text: source.table.actions, ...options });
    const { translated: tableLoading } = useTranslation({ text: source.table.loading, ...options });
    const { translated: tableEmpty } = useTranslation({ text: source.table.empty, ...options });
    const { translated: tableEdit } = useTranslation({ text: source.table.edit, ...options });
    const { translated: tableDelete } = useTranslation({ text: source.table.delete, ...options });
    const { translated: previous } = useTranslation({ text: source.pagination.previous, ...options });
    const { translated: next } = useTranslation({ text: source.pagination.next, ...options });
    const { translated: pagePrefix } = useTranslation({ text: source.pagination.pagePrefix, ...options });
    const { translated: pageSeparator } = useTranslation({ text: source.pagination.pageSeparator, ...options });
    const { translated: january } = useTranslation({ text: source.months.january, ...options });
    const { translated: february } = useTranslation({ text: source.months.february, ...options });
    const { translated: march } = useTranslation({ text: source.months.march, ...options });
    const { translated: april } = useTranslation({ text: source.months.april, ...options });
    const { translated: may } = useTranslation({ text: source.months.may, ...options });
    const { translated: june } = useTranslation({ text: source.months.june, ...options });
    const { translated: july } = useTranslation({ text: source.months.july, ...options });
    const { translated: august } = useTranslation({ text: source.months.august, ...options });
    const { translated: september } = useTranslation({ text: source.months.september, ...options });
    const { translated: october } = useTranslation({ text: source.months.october, ...options });
    const { translated: november } = useTranslation({ text: source.months.november, ...options });
    const { translated: december } = useTranslation({ text: source.months.december, ...options });

    return {
        title, createTab, searchTab, invalidServerResponse,
        availabilityRequiresDateAndSlot, invalidAvailabilityDates,
        invalidAvailabilityHours, invalidAvailabilityAlignment,
        availabilityInPast, overlappingAvailability, availabilityRequiresSlot,
        requiredIdentity, invalidAvailability, deleteConfirm, editTitle,
        createTitle, firstNamePlaceholder, lastNamePlaceholder,
        doctorNumberPlaceholder, phonePlaceholder, emailPlaceholder,
        noClinic, noSpecialty, smsEnabled, availabilityTitle, targetMonth,
        selectDaysHint, noDaySelected, chooseRangePrefix, slotHelp,
        multipleSlotsHint, noSlot, editSlot, removeDay, isoHint, save, create,
        cancel, searchTitle, searchLastNamePlaceholder,
        searchFirstNamePlaceholder, searchDoctorNumberPlaceholder, allClinics,
        tableLastName, tableFirstName, tableDoctorNumber, tableSpecialty,
        tableClinic, tablePhone, tableEmail, tableAvailability, tableActions,
        tableLoading, tableEmpty, tableEdit, tableDelete, previous, next,
        pagePrefix, pageSeparator,
        monthOptions: [
            { value: "01", label: january },
            { value: "02", label: february },
            { value: "03", label: march },
            { value: "04", label: april },
            { value: "05", label: may },
            { value: "06", label: june },
            { value: "07", label: july },
            { value: "08", label: august },
            { value: "09", label: september },
            { value: "10", label: october },
            { value: "11", label: november },
            { value: "12", label: december },
        ],
    };
}

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
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const pageLabels = useSpecialistsPageLabels(i18n.locale);
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
                message: pageLabels.invalidServerResponse,
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
                    error: pageLabels.availabilityRequiresDateAndSlot,
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
                    error: pageLabels.invalidAvailabilityDates,
                };
            }
            for (const time of slot.slots) {
                const [hours, minutes] = time
                    .split(":")
                    .map((value) => Number(value));
                if (Number.isNaN(hours) || Number.isNaN(minutes)) {
                    return {
                        error: pageLabels.invalidAvailabilityHours,
                    };
                }
                if (minutes % 15 !== 0) {
                    return {
                        error: pageLabels.invalidAvailabilityAlignment,
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
                        error: pageLabels.invalidAvailabilityDates,
                    };
                }
                if (start.getTime() < now.getTime()) {
                    return {
                        error: pageLabels.availabilityInPast,
                    };
                }
                const iso = start.toISOString();
                if (seen.has(iso)) {
                    return {
                        error: pageLabels.overlappingAvailability,
                    };
                }
                seen.add(iso);
                slots.push(iso);
            }
        }

        if (slots.length === 0 && values.disponibilites.length > 0) {
            return {
                error: pageLabels.availabilityRequiresSlot,
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
                message: pageLabels.requiredIdentity,
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
                    pageLabels.invalidAvailability,
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
            pageLabels.deleteConfirm
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
            <h1 className="text-2xl font-semibold">{pageLabels.title}</h1>

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
                    {pageLabels.createTab}
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
                    {pageLabels.searchTab}
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
                            ? pageLabels.editTitle
                            : pageLabels.createTitle}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            className="border rounded p-2"
                            placeholder={pageLabels.firstNamePlaceholder}
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
                            placeholder={pageLabels.lastNamePlaceholder}
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
                            placeholder={pageLabels.doctorNumberPlaceholder}
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
                            placeholder={pageLabels.phonePlaceholder}
                            value={form.telephone}
                            readOnly
                        />
                        <input
                            className="border rounded p-2 bg-gray-50"
                            placeholder={pageLabels.emailPlaceholder}
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
                            <option value="">{pageLabels.noClinic}</option>
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
                            <option value="">{pageLabels.noSpecialty}</option>
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
                        {pageLabels.smsEnabled}
                    </label>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">
                            {pageLabels.availabilityTitle}
                        </div>
                        <div className="grid gap-3 md:grid-cols-[200px_1fr] items-start">
                            <div className="space-y-2">
                                <label className="text-xs text-gray-600">
                                    {pageLabels.targetMonth}
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
                                        {pageLabels.monthOptions.map((option) => (
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
                                    {pageLabels.selectDaysHint}
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
                                {pageLabels.noDaySelected}
                            </div>
                        )}
                        {activeDay &&
                            form.disponibilites.some(
                                (d) => d.date === activeDay
                            ) && (
                                <div className="border rounded p-3 bg-white space-y-2">
                                    <div className="text-sm font-medium">
                                        {pageLabels.chooseRangePrefix}{" "}
                                        {activeDay}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {pageLabels.slotHelp}
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
                                        {pageLabels.multipleSlotsHint}
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
                                            : pageLabels.noSlot}
                                        <button
                                            type="button"
                                            className="ml-2 text-xs text-primary underline"
                                            onClick={() => {
                                                setActiveDay(slot.date);
                                            }}
                                        >
                                            {pageLabels.editSlot}
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
                                        {pageLabels.removeDay}
                                    </button>
                                </div>
                            ))}
                        <div className="text-xs text-gray-500">
                            {pageLabels.isoHint}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleSubmit}
                            className="px-4 py-2 bg-primary text-white rounded"
                        >
                            {editingId ? pageLabels.save : pageLabels.create}
                        </button>
                        {editingId && (
                            <button
                                onClick={resetForm}
                                className="px-4 py-2 border rounded"
                            >
                                {pageLabels.cancel}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {viewMode === "list" && (
                <div className="space-y-4">
                    <div className="border rounded p-4 space-y-3">
                        <div className="text-sm font-medium">
                            {pageLabels.searchTitle}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                                className="border rounded p-2"
                                placeholder={pageLabels.searchLastNamePlaceholder}
                                value={filterNom}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterNom(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder={pageLabels.searchFirstNamePlaceholder}
                                value={filterPrenom}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterPrenom(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder={pageLabels.searchDoctorNumberPlaceholder}
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
                                    {pageLabels.allClinics}
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
                                {pageLabels.tableLastName}
                            </th>
                            <th className="text-left p-2">
                                {pageLabels.tableFirstName}
                            </th>
                            <th className="text-left p-2">
                                {pageLabels.tableDoctorNumber}
                            </th>
                            <th className="text-left p-2">
                                {pageLabels.tableSpecialty}
                            </th>
                            <th className="text-left p-2">
                                {pageLabels.tableClinic}
                            </th>
                            <th className="text-left p-2">
                                {pageLabels.tablePhone}
                            </th>
                            <th className="text-left p-2">
                                {pageLabels.tableEmail}
                            </th>
                            <th className="text-left p-2">
                                {pageLabels.tableAvailability}
                            </th>
                            <th className="text-left p-2">
                                {pageLabels.tableActions}
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
                                            {pageLabels.tableLoading}
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
                                                {pageLabels.tableEmpty}
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
                                                        {pageLabels.tableEdit}
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
                                                        {pageLabels.tableDelete}
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
                            {pageLabels.previous}
                        </button>
                        <span className="text-sm text-gray-600">
                            {pageLabels.pagePrefix} {page} {pageLabels.pageSeparator} {totalPages}
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
                            {pageLabels.next}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
