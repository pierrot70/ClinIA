import { useCallback, useContext, useEffect, useState } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import { fetchPatientById, type Patient } from "../services/patientsApi";
import {
    listMyActiveClinicalSupportAccess,
    type ActiveClinicalSupportAccess,
} from "../services/clinicalSupportAccessApi";

function formatDate(value: string, locale: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === "fr" ? "fr-CA" : locale);
}

function shortReference(patientId: string) {
    return patientId.slice(-8).toUpperCase();
}

function useDelegatedAccessLabels(targetLang: string) {
    const source = labels.delegatedPatientAccessPage;
    const translate = (text: string, key: string) =>
        useTranslation({ text, targetLang, translationKey: `delegatedPatientAccessPage.${key}` }).translated;
    return {
        title: translate(source.title, "title"), description: translate(source.description, "description"),
        refresh: translate(source.refresh, "refresh"), loading: translate(source.loading, "loading"),
        empty: translate(source.empty, "empty"), dossier: translate(source.dossier, "dossier"),
        expiresAt: translate(source.expiresAt, "expiresAt"), open: translate(source.open, "open"),
        opening: translate(source.opening, "opening"), readOnly: translate(source.readOnly, "readOnly"),
        patientName: translate(source.patientName, "patientName"), insuranceNumber: translate(source.insuranceNumber, "insuranceNumber"),
        address: translate(source.address, "address"), phone: translate(source.phone, "phone"), email: translate(source.email, "email"),
        unavailable: translate(source.unavailable, "unavailable"),
    };
}

export function DelegatedPatientAccessPage() {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const text = useDelegatedAccessLabels(i18n.locale);
    const [accesses, setAccesses] = useState<ActiveClinicalSupportAccess[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [loading, setLoading] = useState(true);
    const [openingId, setOpeningId] = useState("");
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        const response = await listMyActiveClinicalSupportAccess();
        if ("error" in response) {
            setAccesses([]);
            setSelectedPatient(null);
            setError(response.error.message);
        } else {
            setAccesses(response.data);
            setSelectedPatient((current) => current && response.data.some((access) => access.patientId === current._id) ? current : null);
        }
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const openPatient = async (access: ActiveClinicalSupportAccess) => {
        setOpeningId(access.id);
        setError("");
        const response = await fetchPatientById(access.patientId);
        setOpeningId("");
        if ("error" in response) {
            setSelectedPatient(null);
            setError(response.error.message);
            await load();
            return;
        }
        setSelectedPatient(response.data);
    };

    return (
        <section className="mx-auto max-w-5xl space-y-5 px-4 py-8">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">{text.title}</h1>
                <p className="mt-1 max-w-3xl text-sm text-gray-600">{text.description}</p>
            </div>
            <div className="flex justify-end"><button type="button" onClick={() => void load()} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{text.refresh}</button></div>
            {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
            {loading ? <p className="text-sm text-gray-600">{text.loading}</p> : accesses.length === 0 ? (
                <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-600">{text.empty}</div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm"><thead className="bg-gray-50 text-gray-700"><tr>{[text.dossier, text.expiresAt, text.open].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-100">{accesses.map((access) => <tr key={access.id}><td className="px-4 py-3 font-mono text-gray-900">{text.dossier} #{shortReference(access.patientId)}</td><td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(access.expiresAt, i18n.locale)}</td><td className="px-4 py-3"><button type="button" onClick={() => void openPatient(access)} disabled={openingId !== ""} className="rounded border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60">{openingId === access.id ? text.opening : text.open}</button></td></tr>)}</tbody>
                    </table>
                </div>
            )}
            {selectedPatient && <section className="space-y-4 rounded-lg border border-blue-200 bg-white p-5 shadow-sm"><div><h2 className="text-lg font-semibold text-gray-900">{text.readOnly}</h2><p className="mt-1 text-sm text-gray-600">{text.dossier} #{shortReference(selectedPatient._id)}</p></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-medium text-gray-600">{text.patientName}</dt><dd className="mt-1 text-gray-900">{selectedPatient.prenom} {selectedPatient.nom}</dd></div><div><dt className="font-medium text-gray-600">{text.insuranceNumber}</dt><dd className="mt-1 text-gray-900">{selectedPatient.num_assurance_maladie || text.unavailable}</dd></div><div><dt className="font-medium text-gray-600">{text.address}</dt><dd className="mt-1 text-gray-900">{selectedPatient.addresse || text.unavailable}</dd></div><div><dt className="font-medium text-gray-600">{text.phone}</dt><dd className="mt-1 text-gray-900">{selectedPatient.telephone || text.unavailable}</dd></div><div><dt className="font-medium text-gray-600">{text.email}</dt><dd className="mt-1 text-gray-900">{selectedPatient.courriel || text.unavailable}</dd></div></dl></section>}
        </section>
    );
}
