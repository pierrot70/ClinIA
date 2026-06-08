import React from "react";
import { useTranslation } from "../hooks/useTranslation";
import {
    getImmediateEnglishClinicalContent,
    shouldHideFrenchSourceInEnglish,
} from "../i18n/clinicalContentEnglish";

export interface Treatment {
    name: string;
    justification: string;
    contraindications: string[] | string;
}

interface AITreatmentTableProps {
    treatments: Treatment[];
    language?: "fr" | "en";
}

function TreatmentRow({
    treatment,
    language,
}: {
    treatment: Treatment;
    language: "fr" | "en";
}) {
    const contraindications = Array.isArray(treatment.contraindications)
        ? treatment.contraindications.join(", ")
        : treatment.contraindications;
    const nameTranslation = useTranslation({ text: treatment.name, targetLang: language });
    const justificationTranslation = useTranslation({ text: treatment.justification, targetLang: language });
    const contraindicationsTranslation = useTranslation({ text: contraindications, targetLang: language });
    const english = language === "en";
    const safeEnglish = (source: string, translated: string, loading: boolean, fallback: string) =>
        english && (loading || translated === source || shouldHideFrenchSourceInEnglish(translated))
            ? getImmediateEnglishClinicalContent(source) || fallback
            : translated;
    const name = safeEnglish(treatment.name, nameTranslation.translated, nameTranslation.loading, "Clinical option");
    const justification = safeEnglish(treatment.justification, justificationTranslation.translated, justificationTranslation.loading, "Clinical rationale available in the source analysis.");
    const displayedContraindications = safeEnglish(contraindications, contraindicationsTranslation.translated, contraindicationsTranslation.loading, "None listed");

    return (
        <tr className="border">
            <td className="p-3 border font-semibold">{name}</td>
            <td className="p-3 border">{justification}</td>
            <td className="p-3 border text-red-600">{displayedContraindications}</td>
        </tr>
    );
}

const AITreatmentTable: React.FC<AITreatmentTableProps> = ({ treatments, language = "fr" }) => {
    const english = language === "en";
    return (
        <div className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-blue-700">
                {english ? "Proposed treatment options" : "Options thérapeutiques proposées"}
            </h2>

            <table className="w-full border-collapse text-sm">
                <thead>
                <tr className="bg-gray-100">
                    <th className="p-3 border">{english ? "Treatment" : "Traitement"}</th>
                    <th className="p-3 border">{english ? "Rationale" : "Justification"}</th>
                    <th className="p-3 border">{english ? "Contraindications" : "Contre-indications"}</th>
                </tr>
                </thead>

                <tbody>
                {treatments.map((t, i) => (
                    <TreatmentRow key={i} treatment={t} language={language} />
                ))}
                </tbody>
            </table>
        </div>
    );
};

export default AITreatmentTable;
