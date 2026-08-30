import { useEffect, useState } from "react";
import { labels } from "../i18n/uiLabels";
import {
    createWalkInBooking,
    fetchWalkInAvailability,
    findReceptionPatientByRamq,
    type ReceptionPatient,
    type WalkInAvailability,
} from "../services/receptionApi";
import { useReceptionClinic } from "../contexts/ReceptionClinicContext";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { isReceptionLabel, receptionLabel } from "../i18n/receptionLabels";

const source = labels.walkInArrival;

function patientName(patient: Pick<ReceptionPatient, "prenom" | "nom">) {
    return `${patient.prenom} ${patient.nom}`.trim();
}

type SelectedWalkInSlot = {
    specialist: WalkInAvailability["today"][number]["specialist"];
    date: string;
    time: string;
    slotType: "regular" | "walk_in";
};

function AvailabilityOptions({
    availability,
    onChooseSlot,
    locale,
}: {
    availability: WalkInAvailability;
    onChooseSlot?: (slot: SelectedWalkInSlot) => void;
    locale: string;
}) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-700">{receptionLabel(locale, "availabilityIntro", source.availabilityIntro)}</p>
            <div>
                <h3 className="text-sm font-semibold text-slate-900">{receptionLabel(locale, "availabilityToday", source.availabilityToday)}</h3>
                {availability.today.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-700">{receptionLabel(locale, "noSameDayAvailability", source.noSameDayAvailability)}</p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {availability.today.map((option) => (
                            <li key={`${option.specialist._id}-${option.date}`} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                                <strong>{option.specialist.prenom} {option.specialist.nom}</strong>
                                <span className="ml-2">{option.date}</span>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {option.slots.map((time) => (
                                        <button
                                            key={time}
                                            type="button"
                                            onClick={() => onChooseSlot?.({
                                                specialist: option.specialist,
                                                date: option.date,
                                                time,
                                                slotType: option.slotTypes?.[time] ?? "walk_in",
                                            })}
                                            disabled={!onChooseSlot}
                                            className="rounded border border-blue-600 px-2 py-1 text-xs font-medium text-blue-700 disabled:border-slate-300 disabled:text-slate-600"
                                        >
                                            {time}{onChooseSlot ? ` — ${receptionLabel(locale, "chooseSlot", source.chooseSlot)}` : ""}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div>
                <h3 className="text-sm font-semibold text-slate-900">{receptionLabel(locale, "availabilityFuture", source.availabilityFuture)}</h3>
                {availability.future.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-700">{receptionLabel(locale, "noFutureAvailability", source.noFutureAvailability)}</p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {availability.future.map((option) => (
                            <li key={`${option.specialist._id}-${option.date}`} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                                <strong>{option.specialist.prenom} {option.specialist.nom}</strong>
                                <span className="ml-2">{option.date}</span>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {option.slots.map((time) => (
                                        <button
                                            key={time}
                                            type="button"
                                            onClick={() => onChooseSlot?.({
                                                specialist: option.specialist,
                                                date: option.date,
                                                time,
                                                slotType: option.slotTypes?.[time] ?? "walk_in",
                                            })}
                                            disabled={!onChooseSlot}
                                            className="rounded border border-blue-600 px-2 py-1 text-xs font-medium text-blue-700 disabled:border-slate-300 disabled:text-slate-600"
                                        >
                                            {time}{onChooseSlot ? ` — ${receptionLabel(locale, "chooseSlot", source.chooseSlot)}` : ""}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export function WalkInArrivalPage() {
    const { locale } = useHomeI18n();
    const [ramq, setRamq] = useState("");
    const [patients, setPatients] = useState<ReceptionPatient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<ReceptionPatient | null>(null);
    const [walkInAvailability, setWalkInAvailability] =
        useState<WalkInAvailability | null>(null);
    const [isNewPatient, setIsNewPatient] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<SelectedWalkInSlot | null>(null);
    const [newPatient, setNewPatient] = useState({ prenom: "", nom: "" });
    const [message, setMessage] = useState("");
    const [messageKind, setMessageKind] = useState<"noPatient" | "bookingCreated" | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { activeClinic, isLoading: clinicsLoading, error: clinicsError } = useReceptionClinic();
    const clinicId = activeClinic?._id || "";

    useEffect(() => {
        if (isReceptionLabel(message, "noPatient", source.noPatient)) {
            setMessage("");
            setMessageKind("noPatient");
        }
    }, [locale, message]);

    async function loadWalkInAvailability(
        selectedClinicId = clinicId,
        patientId = selectedPatient?._id
    ) {
        if (!selectedClinicId) {
            setError(source.availabilityRequiredClinic);
            return;
        }

        setError("");
        setLoading(true);
        const response = await fetchWalkInAvailability(selectedClinicId, patientId);
        setLoading(false);

        if (response.error) {
            setError(response.error.message);
            return;
        }

        setWalkInAvailability(response.data || { today: [], future: [] });
    }

    async function searchPatient() {
        setMessage("");
        setMessageKind(null);
        setError("");
        setSelectedPatient(null);
        setPatients([]);
        setWalkInAvailability(null);
        setIsNewPatient(false);
        setSelectedSlot(null);
        setNewPatient({ prenom: "", nom: "" });
        if (!ramq.trim()) {
            setError(receptionLabel(locale, "noPatient", source.noPatient));
            return;
        }

        if (!clinicId) {
            setError(source.availabilityRequiredClinic);
            return;
        }

        setLoading(true);
        const response = await findReceptionPatientByRamq(clinicId, ramq.trim());
        setLoading(false);

        if (response.error) {
            setError(response.error.message);
            return;
        }

        const matches = response.data ? [response.data] : [];
        setPatients(matches);
        if (matches.length === 0) {
            setIsNewPatient(true);
            setMessageKind("noPatient");
            await loadWalkInAvailability();
        }
    }

    function confirmSelection() {
        setMessage("");
        setError("");
        if (!selectedPatient || !clinicId) {
            setError(source.required);
            return;
        }
        void loadWalkInAvailability(clinicId, selectedPatient._id);
    }

    async function createPatientAndAppointment() {
        if (!selectedSlot || !clinicId || !ramq.trim()) {
            setError(source.required);
            return;
        }
        if (!selectedPatient && (!newPatient.prenom.trim() || !newPatient.nom.trim())) {
            setError(source.required);
            return;
        }

        setError("");
        setLoading(true);
        const response = await createWalkInBooking({
            clinic: clinicId,
            specialist: selectedSlot.specialist._id,
            date: selectedSlot.date,
            time: selectedSlot.time,
            slotType: selectedSlot.slotType,
            ...(selectedPatient
                ? { patientId: selectedPatient._id }
                : {
                    patient: {
                        prenom: newPatient.prenom.trim(),
                        nom: newPatient.nom.trim(),
                        num_assurance_maladie: ramq.trim(),
                        country: "CA",
                        healthInsuranceJurisdiction: "QC",
                        language: "fr",
                    },
                }),
        });
        setLoading(false);

        if (response.error) {
            setError(response.error.message);
            return;
        }

        setMessageKind("bookingCreated");
        setMessage("");
        setSelectedSlot(null);
        setNewPatient({ prenom: "", nom: "" });
        setRamq("");
        setPatients([]);
        setSelectedPatient(null);
        setWalkInAvailability(null);
        setIsNewPatient(false);
    }

    if (selectedSlot) {
        const clinicName = activeClinic?.nom ?? clinicId;
        return (
            <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
                <header>
                    <h1 className="text-2xl font-semibold text-slate-900">
                        {selectedPatient
                            ? receptionLabel(locale, "existingPatientFormTitle", source.existingPatientFormTitle)
                            : receptionLabel(locale, "newPatientFormTitle", source.newPatientFormTitle)}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        {selectedPatient
                            ? receptionLabel(locale, "existingPatientFormDescription", source.existingPatientFormDescription)
                            : receptionLabel(locale, "newPatientFormDescription", source.newPatientFormDescription)}
                    </p>
                </header>

                {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

                <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-800">
                        {receptionLabel(locale, "selectedSlot", source.selectedSlot)
                            .replace("{specialist}", `${selectedSlot.specialist.prenom} ${selectedSlot.specialist.nom}`)
                            .replace("{date}", selectedSlot.date)
                            .replace("{time}", selectedSlot.time)}
                        <span className="block text-slate-600">{receptionLabel(locale, "assignedClinic", source.assignedClinic).replace("{name}", clinicName)}</span>
                    </p>

                    {selectedPatient ? (
                        <p className="text-sm font-medium text-slate-800">
                            {receptionLabel(locale, "existingPatientLabel", source.existingPatientLabel).replace("{name}", patientName(selectedPatient))}
                        </p>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-sm font-medium text-slate-800">
                                    {receptionLabel(locale, "firstNameLabel", source.firstNameLabel)}
                                    <input
                                        value={newPatient.prenom}
                                        onChange={(event) => setNewPatient((current) => ({ ...current, prenom: event.target.value }))}
                                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                                        autoComplete="given-name"
                                    />
                                </label>
                                <label className="text-sm font-medium text-slate-800">
                                    {receptionLabel(locale, "lastNameLabel", source.lastNameLabel)}
                                    <input
                                        value={newPatient.nom}
                                        onChange={(event) => setNewPatient((current) => ({ ...current, nom: event.target.value }))}
                                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                                        autoComplete="family-name"
                                    />
                                </label>
                            </div>
                            <label className="block text-sm font-medium text-slate-800">
                                {receptionLabel(locale, "ramqReadOnlyLabel", source.ramqReadOnlyLabel)}
                                <input value={ramq} readOnly className="mt-1 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 font-normal text-slate-700" />
                            </label>
                        </>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setSelectedSlot(null); setError(""); }} disabled={loading} className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            {receptionLabel(locale, "backToAvailability", source.backToAvailability)}
                        </button>
                        <button type="button" onClick={() => void createPatientAndAppointment()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                            {loading
                                ? receptionLabel(locale, "creatingPatientAndAppointment", source.creatingPatientAndAppointment)
                                : selectedPatient
                                    ? receptionLabel(locale, "createAppointment", source.createAppointment)
                                    : receptionLabel(locale, "createPatientAndAppointment", source.createPatientAndAppointment)}
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            <header>
                <h1 className="text-2xl font-semibold text-slate-900">{receptionLabel(locale, "title", source.title)}</h1>
                <p className="mt-1 text-sm text-slate-600">{receptionLabel(locale, "description", source.description)}</p>
            </header>

            {(message || messageKind) && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{messageKind === "bookingCreated" ? receptionLabel(locale, "existingBookingCreated", source.existingBookingCreated) : messageKind === "noPatient" || isReceptionLabel(message, "noPatient", source.noPatient) ? receptionLabel(locale, "noPatient", source.noPatient) : message}</p>}
            {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{(isReceptionLabel(error, "noPatient", source.noPatient) || /active patient.*health insurance/i.test(error)) ? receptionLabel(locale, "noPatient", source.noPatient) : error}</p>}

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="walk-in-ramq">{receptionLabel(locale, "ramqLabel", source.ramqLabel)}</label>
                <div className="flex gap-2">
                    <input id="walk-in-ramq" value={ramq} onChange={(event) => setRamq(event.target.value)} placeholder={source.ramqPlaceholder} className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2" />
                    <button type="button" onClick={() => void searchPatient()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{receptionLabel(locale, "searchPatient", source.searchPatient)}</button>
                </div>

                {patients.length > 0 && (
                    <div className="mt-3 space-y-1">
                        {patients.map((patient) => (
                            <button key={patient._id} type="button" onClick={() => { setSelectedPatient(patient); setMessage(""); setWalkInAvailability(null); }} className={`block w-full rounded border px-3 py-2 text-left text-sm ${selectedPatient?._id === patient._id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                                {patientName(patient)} <span className="float-right text-blue-700">{receptionLabel(locale, "selectPatient", source.selectPatient)}</span>
                            </button>
                        ))}
                    </div>
                )}
                {selectedPatient && <p className="mt-3 text-sm text-slate-700">{receptionLabel(locale, "selectedPatient", source.selectedPatient).replace("{name}", patientName(selectedPatient))}</p>}

                {clinicsLoading ? (
                    <p className="mt-5 text-sm text-slate-600">{receptionLabel(locale, "availabilityLoading", source.availabilityLoading)}</p>
                ) : activeClinic ? (
                    <p className="mt-5 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        {receptionLabel(locale, "assignedClinic", source.assignedClinic).replace("{name}", activeClinic.nom)}
                    </p>
                ) : (
                    <p role="alert" className="mt-5 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {clinicsError || source.availabilityRequiredClinic}
                    </p>
                )}

                {isNewPatient ? (
                    <div className="mt-5 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <div>
                            <h2 className="font-medium text-amber-950">{receptionLabel(locale, "newPatientTitle", source.newPatientTitle)}</h2>
                            <p className="mt-1 text-sm text-amber-900">{receptionLabel(locale, "newPatientDescription", source.newPatientDescription)}</p>
                        </div>
                        <button type="button" onClick={() => void loadWalkInAvailability()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{receptionLabel(locale, "searchAvailability", source.searchAvailability)}</button>
                        {loading && <p className="text-sm text-slate-600">{source.availabilityLoading}</p>}
                        {walkInAvailability && <AvailabilityOptions availability={walkInAvailability} onChooseSlot={setSelectedSlot} locale={locale} />}
                    </div>
                ) : (
                    <>
                        <button type="button" onClick={confirmSelection} disabled={!selectedPatient || loading} className="mt-4 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{receptionLabel(locale, "searchAvailability", source.searchAvailability)}</button>
                        {selectedPatient && <p className="mt-3 text-sm text-slate-700">{receptionLabel(locale, "existingPatientDescription", source.existingPatientDescription)}</p>}
                        {loading && selectedPatient && <p className="mt-3 text-sm text-slate-600">{source.availabilityLoading}</p>}
                        {selectedPatient && walkInAvailability && (
                            <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                                <AvailabilityOptions availability={walkInAvailability} onChooseSlot={setSelectedSlot} locale={locale} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
