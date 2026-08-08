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
    clinique: string;
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
    const { translated: primaryClinic } = useTranslation({ text: source.form.primaryClinic, ...options });
    const { translated: secondClinic } = useTranslation({ text: source.form.secondClinic, ...options });
    const { translated: availabilityClinic } = useTranslation({ text: source.form.availabilityClinic, ...options });
    const { translated: clinicRequired } = useTranslation({ text: source.form.clinicRequired, ...options });
    const { translated: clinicRequiredForAvailability } = useTranslation({ text: source.form.clinicRequiredForAvailability, ...options });
    const { translated: slotUnavailableAtAnotherClinic } = useTranslation({ text: source.form.slotUnavailableAtAnotherClinic, ...options });
    const { translated: historicalAvailability } = useTranslation({ text: source.form.historicalAvailability, ...options });
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
        noClinic, primaryClinic, secondClinic, availabilityClinic, clinicRequired,
        clinicRequiredForAvailability, slotUnavailableAtAnotherClinic, historicalAvailability, noSpecialty, smsEnabled, availabilityTitle, targetMonth,
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

function specialistPracticeLocations(specialist: Specialist) {
    if (specialist.practiceLocations?.length) {
        return specialist.practiceLocations;
    }
    if (specialist.clinique_associer) {
        return [{
            clinique: String(specialist.clinique_associer),
            disponibilites: specialist.disponibilites ?? [],
        }];
    }
    return [];
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
        secondaryClinique: "",
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
    const [availabilityClinique, setAvailabilityClinique] = useState("");
    const [lastClickedSlot, setLastClickedSlot] = useState<string | null>(
        null
    );
    const [viewMode, setViewMode] = useState<"create" | "list">("list");
    const [expandedSpecialistId, setExpandedSpecialistId] = useState<string | null>(null);

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
        setExpandedSpecialistId((current) =>
            response.data.data.some((specialist) => specialist._id === current)
                ? current
                : null
        );
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
            secondaryClinique: "",
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
        setAvailabilityClinique("");
    }

    function handleCliniqueSelection(value: string) {
        const { telephone, email } = getClinicContacts(
            value || undefined
        );

        setForm((prev) => ({
            ...prev,
            clinique_associer: value,
            secondaryClinique:
                prev.secondaryClinique === value ? "" : prev.secondaryClinique,
            telephone,
            email,
        }));
        setAvailabilityClinique(value);
    }

    function toPayload(
        values: typeof form
    ): { payload?: SpecialistPayload; error?: string } {
        const now = new Date();
        const slotsByClinique = new Map<string, string[]>();
        const seen = new Set<string>();

        if (!values.clinique_associer.trim()) {
            return { error: pageLabels.clinicRequired };
        }

        for (const slot of values.disponibilites) {
            if (
                !slot.date ||
                !slot.clinique ||
                !slot.slots ||
                slot.slots.length === 0
            ) {
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
                // Existing schedules are retained when editing a specialist.
                // The calendar does not allow creating past slots, and the API
                // independently rejects any newly submitted past availability.
                if (!editingId && start.getTime() < now.getTime()) {
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
                const locationSlots = slotsByClinique.get(slot.clinique) ?? [];
                locationSlots.push(iso);
                slotsByClinique.set(slot.clinique, locationSlots);
            }
        }

        if (slotsByClinique.size === 0 && values.disponibilites.length > 0) {
            return {
                error: pageLabels.availabilityRequiresSlot,
            };
        }

        const clinicIds = [
            values.clinique_associer.trim(),
            values.secondaryClinique.trim(),
        ].filter(Boolean);
        if (new Set(clinicIds).size !== clinicIds.length) {
            return { error: pageLabels.clinicRequired };
        }
        const practiceLocations = clinicIds.map((clinique) => ({
            clinique,
            disponibilites: (slotsByClinique.get(clinique) ?? []).slice().sort(),
        }));

        const payload: SpecialistPayload = {
            nom: values.nom.trim(),
            prenom: values.prenom.trim(),
            numero_medecin: values.numero_medecin.trim(),
            texto: values.texto,
            practiceLocations,
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
        setExpandedSpecialistId(null);
        setEditingId(specialist._id);
        const practiceLocations =
            specialist.practiceLocations?.length
                ? specialist.practiceLocations
                : specialist.clinique_associer
                  ? [
                        {
                            clinique: String(specialist.clinique_associer),
                            disponibilites: specialist.disponibilites ?? [],
                        },
                    ]
                  : [];
        const clinicId = practiceLocations[0]?.clinique ?? "";
        const secondaryClinique = practiceLocations[1]?.clinique ?? "";
        const clinicContacts = getClinicContacts(clinicId || undefined);
        const telephoneValue =
            clinicContacts.telephone || specialist.telephone || "";
        const emailValue = clinicContacts.email || specialist.email || "";
        const slots = practiceLocations.flatMap((location) =>
            (location.disponibilites ?? [])
                .map((slot) => ({ clinique: location.clinique, date: new Date(slot) }))
                .filter((slot) => !Number.isNaN(slot.date.getTime()))
        ).sort((left, right) => left.date.getTime() - right.date.getTime());
        const baseMonthKey =
            slots.length > 0
                ? `${slots[0].date.getFullYear()}-${String(
                      slots[0].date.getMonth() + 1
                  ).padStart(2, "0")}`
                : monthKey;
        const grouped: Record<string, typeof slots> = {};
        slots.forEach((slot) => {
            const key = `${slot.clinique}:${slot.date.getFullYear()}-${String(
                slot.date.getMonth() + 1
            ).padStart(2, "0")}-${String(slot.date.getDate()).padStart(
                2,
                "0"
            )}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(slot);
        });
        const disponibilites = Object.keys(grouped)
            .sort()
            .map((key) => {
                const [clinique, date] = key.split(":");
                const daySlots = grouped[key].sort(
                    (a, b) => a.date.getTime() - b.date.getTime()
                );
                return {
                    clinique,
                    date,
                    slots: daySlots.map(
                        (slot) =>
                            `${padTime(slot.date.getHours())}:${padTime(
                                slot.date.getMinutes()
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
            secondaryClinique,
            specialite: specialist.specialite ?? "",
            disponibilites,
        });
        setAvailabilityClinique(clinicId);
        setActiveDay(null);
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
        setExpandedSpecialistId((current) => (current === id ? null : current));
        await loadSpecialists();
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 sm:p-6 space-y-6 overflow-x-hidden">
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
                        <label className="space-y-1 text-xs text-gray-600">
                            <span>{pageLabels.primaryClinic}</span>
                            <select
                                className="border rounded p-2 w-full text-sm text-gray-900"
                                value={form.clinique_associer}
                                onChange={(event) =>
                                    handleCliniqueSelection(event.target.value)
                                }
                            >
                                <option value="">{pageLabels.noClinic}</option>
                                {cliniqueOptions.map((clinique) => (
                                    <option key={clinique._id} value={clinique._id}>
                                        {clinique.nom}{" "}
                                        {clinique.rue && `(${clinique.rue})`}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-1 text-xs text-gray-600">
                            <span>{pageLabels.secondClinic}</span>
                            <select
                                className="border rounded p-2 w-full text-sm text-gray-900"
                                value={form.secondaryClinique}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setForm((current) => ({
                                        ...current,
                                        secondaryClinique: value,
                                    }));
                                    if (
                                        !availabilityClinique ||
                                        availabilityClinique === form.secondaryClinique
                                    ) {
                                        setAvailabilityClinique(value || form.clinique_associer);
                                    }
                                }}
                            >
                                <option value="">{pageLabels.noClinic}</option>
                                {cliniqueOptions
                                    .filter((clinique) => clinique._id !== form.clinique_associer)
                                    .map((clinique) => (
                                        <option key={clinique._id} value={clinique._id}>
                                            {clinique.nom}{" "}
                                            {clinique.rue && `(${clinique.rue})`}
                                        </option>
                                    ))}
                            </select>
                        </label>
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
                        <label className="block max-w-md space-y-1 text-xs text-gray-600">
                            <span>{pageLabels.availabilityClinic}</span>
                            <select
                                className="w-full border rounded p-2 text-sm text-gray-900"
                                value={availabilityClinique}
                                onChange={(event) => {
                                    setAvailabilityClinique(event.target.value);
                                    setActiveDay(null);
                                }}
                            >
                                <option value="">{pageLabels.noClinic}</option>
                                {[form.clinique_associer, form.secondaryClinique]
                                    .filter(Boolean)
                                    .map((clinicId) => (
                                        <option key={clinicId} value={clinicId}>
                                            {cliniqueMap[clinicId]?.nom ?? clinicId}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        {!availabilityClinique && (
                            <div className="text-xs text-amber-700">
                                {pageLabels.clinicRequiredForAvailability}
                            </div>
                        )}
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
                                                        d.date === dateKey &&
                                                        d.clinique === availabilityClinique
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
                                                    disabled={isPastDay || !availabilityClinique}
                                                    onClick={() => {
                                                        setForm((p) => {
                                                            const exists =
                                                                p.disponibilites.some(
                                                                    (d) =>
                                                                        d.date ===
                                                                        dateKey &&
                                                                        d.clinique ===
                                                                            availabilityClinique
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
                                                                              dateKey ||
                                                                              d.clinique !==
                                                                                  availabilityClinique
                                                                      )
                                                                    : [
                                                                          ...p.disponibilites,
                                                                          {
                                                                              date: dateKey,
                                                                              slots: [],
                                                                              clinique: availabilityClinique,
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
                                (d) =>
                                    d.date === activeDay &&
                                    d.clinique === availabilityClinique
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
                                            const isOccupiedAtAnotherClinic =
                                                form.disponibilites.some(
                                                    (availability) =>
                                                        availability.date === activeDay &&
                                                        availability.clinique !==
                                                            availabilityClinique &&
                                                        availability.slots.includes(slot)
                                                );
                                            const isSelected =
                                                form.disponibilites
                                                    .find(
                                                        (d) =>
                                                            d.date ===
                                                            activeDay &&
                                                            d.clinique ===
                                                                availabilityClinique
                                                    )
                                                    ?.slots.includes(slot) ??
                                                false;
                                            return (
                                                <button
                                                    key={slot}
                                                    type="button"
                                                    disabled={
                                                        isPastSlot ||
                                                        isOccupiedAtAnotherClinic
                                                    }
                                                    title={
                                                        isOccupiedAtAnotherClinic
                                                            ? pageLabels.slotUnavailableAtAnotherClinic
                                                            : undefined
                                                    }
                                                    className={`border rounded px-2 py-1 text-xs ${
                                                        isSelected
                                                            ? "bg-primary text-white border-primary"
                                                            : isOccupiedAtAnotherClinic
                                                              ? "bg-gray-100 text-gray-400 border-gray-200 line-through"
                                                            : "bg-white text-gray-700 border-gray-200"
                                                    } ${
                                                        isPastSlot || isOccupiedAtAnotherClinic
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
                                                                      return TIME_SLOTS
                                                                          .slice(from, to + 1)
                                                                          .filter(
                                                                              (candidateSlot) =>
                                                                                  !form.disponibilites.some(
                                                                                      (availability) =>
                                                                                          availability.date ===
                                                                                              activeDay &&
                                                                                          availability.clinique !==
                                                                                              availabilityClinique &&
                                                                                          availability.slots.includes(
                                                                                              candidateSlot
                                                                                          )
                                                                                  )
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
                                                                        activeDay &&
                                                                        current.clinique ===
                                                                            availabilityClinique
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
                            .map((slot) => {
                                const isHistorical =
                                    slot.date < toLocalDateKey(new Date());
                                return (
                                <div
                                    key={`${slot.clinique}-${slot.date}`}
                                    className={`grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center rounded px-2 py-1 ${
                                        isHistorical
                                            ? "bg-slate-100 text-slate-500"
                                            : ""
                                    }`}
                                >
                                    <div className="text-sm font-medium">
                                        {slot.date} — {cliniqueMap[slot.clinique]?.nom ?? slot.clinique}
                                        {isHistorical && (
                                            <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                {pageLabels.historicalAvailability}
                                            </span>
                                        )}
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
                                                setAvailabilityClinique(slot.clinique);
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
                                                            slot.date ||
                                                            current.clinique !==
                                                                slot.clinique
                                                    ),
                                            }))
                                        }
                                    >
                                        {pageLabels.removeDay}
                                    </button>
                                </div>
                                );
                            })}
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

                    <div className="md:hidden border rounded divide-y bg-white">
                        {loading && (
                            <div className="p-3 text-sm text-gray-500">
                                {pageLabels.tableLoading}
                            </div>
                        )}
                        {!loading && specialists.length === 0 && (
                            <div className="p-3 text-sm text-gray-500">
                                {pageLabels.tableEmpty}
                            </div>
                        )}
                        {!loading &&
                            specialists.map((sp) => {
                                const isExpanded = expandedSpecialistId === sp._id;
                                const practiceLocations = specialistPracticeLocations(sp);
                                const associatedClinique = practiceLocations[0]
                                    ? cliniqueMap[practiceLocations[0].clinique]
                                    : undefined;
                                const specialtyLabel = sp.specialite?.trim() || "—";
                                const clinicLabel = practiceLocations
                                    .map((location) =>
                                        cliniqueMap[location.clinique]?.nom ?? location.clinique
                                    )
                                    .join(" · ") || "—";
                                const clinicTelephone = associatedClinique?.telephone || "—";
                                const clinicCourriel = associatedClinique?.courriel || "—";
                                const disponibilitesLabel = practiceLocations
                                    .map((location) => {
                                        const clinicName =
                                            cliniqueMap[location.clinique]?.nom ?? location.clinique;
                                        return `${clinicName}: ${formatDisponibilites(location.disponibilites)}`;
                                    })
                                    .join(" · ") || "—";
                                const isRowHighlighted = highlightedId === sp._id;

                                return (
                                    <div
                                        key={sp._id}
                                        className={`p-3 ${
                                            isRowHighlighted
                                                ? "bg-gradient-to-r from-emerald-50 via-white to-white"
                                                : ""
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            className="grid w-full grid-cols-3 gap-2 text-left"
                                            onClick={() =>
                                                setExpandedSpecialistId((current) =>
                                                    current === sp._id ? null : sp._id
                                                )
                                            }
                                        >
                                            <div className="min-w-0">
                                                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                    {pageLabels.tableLastName}
                                                </div>
                                                <div className="truncate text-sm font-medium text-gray-900">
                                                    {sp.nom}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                    {pageLabels.tableFirstName}
                                                </div>
                                                <div className="truncate text-sm text-gray-900">
                                                    {sp.prenom}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                    {pageLabels.tableSpecialty}
                                                </div>
                                                <div className="truncate text-sm text-gray-900">
                                                    {specialtyLabel}
                                                </div>
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="mt-3 space-y-3 rounded-lg border bg-gray-50 p-3">
                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    <div>
                                                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                            {pageLabels.tableDoctorNumber}
                                                        </div>
                                                        <div className="text-sm text-gray-900">
                                                            {sp.numero_medecin}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                            {pageLabels.tableClinic}
                                                        </div>
                                                        <div className="text-sm text-gray-900">
                                                            {clinicLabel}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                            {pageLabels.tablePhone}
                                                        </div>
                                                        <div className="text-sm text-gray-900 break-words">
                                                            {clinicTelephone}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                            {pageLabels.tableEmail}
                                                        </div>
                                                        <div className="text-sm text-gray-900 break-all">
                                                            {clinicCourriel}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                        {pageLabels.tableAvailability}
                                                    </div>
                                                    <div className="text-sm text-gray-900">
                                                        {disponibilitesLabel}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                        {pageLabels.tableActions}
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <button
                                                            className="px-3 py-2 border rounded whitespace-nowrap"
                                                            type="button"
                                                            onClick={() => handleEdit(sp)}
                                                        >
                                                            {pageLabels.tableEdit}
                                                        </button>
                                                        <button
                                                            className="px-3 py-2 border rounded text-red-600 whitespace-nowrap"
                                                            type="button"
                                                            disabled={busyIds[sp._id]}
                                                            onClick={() => handleDelete(sp._id)}
                                                        >
                                                            {pageLabels.tableDelete}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                    </div>

                    <div className="hidden md:block border rounded overflow-x-auto">
                        <table className="w-full min-w-[920px] text-sm">
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
                            <th className="text-left p-2 sticky right-0 bg-gray-100 z-10 min-w-[140px]">
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
                                        const practiceLocations = specialistPracticeLocations(sp);
                                        const associatedClinique = practiceLocations[0]
                                            ? cliniqueMap[practiceLocations[0].clinique]
                                            : undefined;
                                        const specialtyLabel =
                                            sp.specialite?.trim() || "—";
                                        const clinicLabel = practiceLocations
                                            .map((location) =>
                                                cliniqueMap[location.clinique]?.nom ?? location.clinique
                                            )
                                            .join(" · ") || "—";
                                        const clinicTelephone =
                                            associatedClinique?.telephone ||
                                            "—";
                                        const clinicCourriel =
                                            associatedClinique?.courriel ||
                                            "—";
                                        const disponibilitesLabel = practiceLocations
                                            .map((location) => {
                                                const clinicName =
                                                    cliniqueMap[location.clinique]?.nom ?? location.clinique;
                                                return `${clinicName}: ${formatDisponibilites(location.disponibilites)}`;
                                            })
                                            .join(" · ") || "—";

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
                                                <td className="p-2 align-top sticky right-0 bg-white z-10 shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.35)]">
                                                    <div className="flex flex-col gap-2 min-w-[132px]">
                                                        <button
                                                            className="px-2 py-1 border rounded whitespace-nowrap"
                                                            type="button"
                                                            onClick={() =>
                                                                handleEdit(sp)
                                                            }
                                                        >
                                                            {pageLabels.tableEdit}
                                                        </button>
                                                        <button
                                                            className="px-2 py-1 border rounded text-red-600 whitespace-nowrap"
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
                                                    </div>
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
