import { useEffect, useState } from "react";
import { labels } from "../i18n/uiLabels";
import {
    createWalkInBooking,
    fetchReceptionClinics,
    fetchWalkInAvailability,
    findReceptionPatientByRamq,
    type ReceptionClinic,
    type ReceptionPatient,
    type WalkInAvailability,
} from "../services/receptionApi";

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
}: {
    availability: WalkInAvailability;
    onChooseSlot?: (slot: SelectedWalkInSlot) => void;
}) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-700">{source.availabilityIntro}</p>
            <div>
                <h3 className="text-sm font-semibold text-slate-900">{source.availabilityToday}</h3>
                {availability.today.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-700">{source.noSameDayAvailability}</p>
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
                                            {time}{onChooseSlot ? ` — ${source.chooseSlot}` : ""}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div>
                <h3 className="text-sm font-semibold text-slate-900">{source.availabilityFuture}</h3>
                {availability.future.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-700">{source.noFutureAvailability}</p>
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
                                            {time}{onChooseSlot ? ` — ${source.chooseSlot}` : ""}
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
    const [ramq, setRamq] = useState("");
    const [patients, setPatients] = useState<ReceptionPatient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<ReceptionPatient | null>(null);
    const [clinics, setClinics] = useState<ReceptionClinic[]>([]);
    const [clinicId, setClinicId] = useState("");
    const [walkInAvailability, setWalkInAvailability] =
        useState<WalkInAvailability | null>(null);
    const [isNewPatient, setIsNewPatient] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<SelectedWalkInSlot | null>(null);
    const [newPatient, setNewPatient] = useState({ prenom: "", nom: "" });
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

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

    useEffect(() => {
        void (async () => {
            const response = await fetchReceptionClinics();
            if (response.data) {
                const availableClinics = response.data;
                setClinics(availableClinics);
                if (availableClinics.length === 1) setClinicId(availableClinics[0]._id);
            }
            if (response.error) setError(response.error.message);
        })();
    }, []);

    async function searchPatient() {
        setMessage("");
        setError("");
        setSelectedPatient(null);
        setPatients([]);
        setWalkInAvailability(null);
        setIsNewPatient(false);
        setSelectedSlot(null);
        setNewPatient({ prenom: "", nom: "" });
        if (!ramq.trim()) {
            setError(source.noPatient);
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
            setMessage(source.noPatient);
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

        setMessage(selectedPatient ? source.existingBookingCreated : source.bookingCreated);
        setSelectedSlot(null);
        setNewPatient({ prenom: "", nom: "" });
        setRamq("");
        setPatients([]);
        setSelectedPatient(null);
        setWalkInAvailability(null);
        setIsNewPatient(false);
    }

    if (selectedSlot) {
        const clinicName = clinics.find((clinic) => clinic._id === clinicId)?.nom ?? clinicId;
        return (
            <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
                <header>
                    <h1 className="text-2xl font-semibold text-slate-900">
                        {selectedPatient
                            ? source.existingPatientFormTitle
                            : source.newPatientFormTitle}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        {selectedPatient
                            ? source.existingPatientFormDescription
                            : source.newPatientFormDescription}
                    </p>
                </header>

                {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

                <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-800">
                        {source.selectedSlot
                            .replace("{specialist}", `${selectedSlot.specialist.prenom} ${selectedSlot.specialist.nom}`)
                            .replace("{date}", selectedSlot.date)
                            .replace("{time}", selectedSlot.time)}
                        <span className="block text-slate-600">{source.assignedClinic.replace("{name}", clinicName)}</span>
                    </p>

                    {selectedPatient ? (
                        <p className="text-sm font-medium text-slate-800">
                            {source.existingPatientLabel.replace("{name}", patientName(selectedPatient))}
                        </p>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-sm font-medium text-slate-800">
                                    {source.firstNameLabel}
                                    <input
                                        value={newPatient.prenom}
                                        onChange={(event) => setNewPatient((current) => ({ ...current, prenom: event.target.value }))}
                                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                                        autoComplete="given-name"
                                    />
                                </label>
                                <label className="text-sm font-medium text-slate-800">
                                    {source.lastNameLabel}
                                    <input
                                        value={newPatient.nom}
                                        onChange={(event) => setNewPatient((current) => ({ ...current, nom: event.target.value }))}
                                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal"
                                        autoComplete="family-name"
                                    />
                                </label>
                            </div>
                            <label className="block text-sm font-medium text-slate-800">
                                {source.ramqReadOnlyLabel}
                                <input value={ramq} readOnly className="mt-1 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 font-normal text-slate-700" />
                            </label>
                        </>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setSelectedSlot(null); setError(""); }} disabled={loading} className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            {source.backToAvailability}
                        </button>
                        <button type="button" onClick={() => void createPatientAndAppointment()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                            {loading
                                ? source.creatingPatientAndAppointment
                                : selectedPatient
                                    ? source.createAppointment
                                    : source.createPatientAndAppointment}
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            <header>
                <h1 className="text-2xl font-semibold text-slate-900">{source.title}</h1>
                <p className="mt-1 text-sm text-slate-600">{source.description}</p>
            </header>

            {message && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
            {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="walk-in-ramq">{source.ramqLabel}</label>
                <div className="flex gap-2">
                    <input id="walk-in-ramq" value={ramq} onChange={(event) => setRamq(event.target.value)} placeholder={source.ramqPlaceholder} className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2" />
                    <button type="button" onClick={() => void searchPatient()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{source.searchPatient}</button>
                </div>

                {patients.length > 0 && (
                    <div className="mt-3 space-y-1">
                        {patients.map((patient) => (
                            <button key={patient._id} type="button" onClick={() => { setSelectedPatient(patient); setMessage(""); setWalkInAvailability(null); }} className={`block w-full rounded border px-3 py-2 text-left text-sm ${selectedPatient?._id === patient._id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                                {patientName(patient)} <span className="float-right text-blue-700">{source.selectPatient}</span>
                            </button>
                        ))}
                    </div>
                )}
                {selectedPatient && <p className="mt-3 text-sm text-slate-700">{source.selectedPatient.replace("{name}", patientName(selectedPatient))}</p>}

                {clinics.length === 1 ? (
                    <p className="mt-5 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        {source.assignedClinic.replace("{name}", clinics[0].nom)}
                    </p>
                ) : (
                    <>
                        <label className="mb-1 mt-5 block text-sm font-medium text-slate-800" htmlFor="walk-in-clinic">{source.clinicLabel}</label>
                        <select id="walk-in-clinic" value={clinicId} onChange={(event) => { setClinicId(event.target.value); setMessage(""); setWalkInAvailability(null); }} className="w-full rounded border border-slate-300 px-3 py-2">
                            <option value="">{source.chooseClinic}</option>
                            {clinics.map((clinic) => <option key={clinic._id} value={clinic._id}>{clinic.nom}</option>)}
                        </select>
                    </>
                )}

                {isNewPatient ? (
                    <div className="mt-5 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <div>
                            <h2 className="font-medium text-amber-950">{source.newPatientTitle}</h2>
                            <p className="mt-1 text-sm text-amber-900">{source.newPatientDescription}</p>
                        </div>
                        <button type="button" onClick={() => void loadWalkInAvailability()} disabled={loading} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{source.searchAvailability}</button>
                        {loading && <p className="text-sm text-slate-600">{source.availabilityLoading}</p>}
                        {walkInAvailability && <AvailabilityOptions availability={walkInAvailability} onChooseSlot={setSelectedSlot} />}
                    </div>
                ) : (
                    <>
                        <button type="button" onClick={confirmSelection} disabled={!selectedPatient || loading} className="mt-4 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{source.searchAvailability}</button>
                        {selectedPatient && <p className="mt-3 text-sm text-slate-700">{source.existingPatientDescription}</p>}
                        {loading && selectedPatient && <p className="mt-3 text-sm text-slate-600">{source.availabilityLoading}</p>}
                        {selectedPatient && walkInAvailability && (
                            <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                                <AvailabilityOptions availability={walkInAvailability} onChooseSlot={setSelectedSlot} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
