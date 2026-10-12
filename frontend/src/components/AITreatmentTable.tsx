import React from "react";
import { useTranslation } from "../hooks/useTranslation";
import { useUiLabels } from "../hooks/useUiLabels";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
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
    const { t } = useUiLabels(language);
    const fixed = UI_LABELS_FR.residualClinicalUi;
    const contraindications = Array.isArray(treatment.contraindications)
        ? treatment.contraindications.join(", ")
        : typeof treatment.contraindications === "string" ? treatment.contraindications : "";
    const nameTranslation = useTranslation({ text: treatment.name, targetLang: language });
    const justificationTranslation = useTranslation({ text: treatment.justification, targetLang: language });
    const contraindicationsTranslation = useTranslation({ text: contraindications, targetLang: language });
    const english = language === "en";
    const safeEnglish = (source: string, translated: string, loading: boolean, fallback: string) =>
        english && (loading || translated === source || shouldHideFrenchSourceInEnglish(translated))
            ? getImmediateEnglishClinicalContent(source) || fallback
            : translated;
    const name = safeEnglish(treatment.name, nameTranslation.translated, nameTranslation.loading, t(fixed.clinicalOption));
    const justification = safeEnglish(treatment.justification, justificationTranslation.translated, justificationTranslation.loading, t(fixed.rationaleInSource));
    const displayedContraindications = contraindications?.trim()
        ? safeEnglish(contraindications, contraindicationsTranslation.translated, contraindicationsTranslation.loading, t(fixed.noneListed))
        : t(fixed.noneListed);

    return (
        <tr className="border">
            <td className="p-3 border font-semibold">{name}</td>
            <td className="p-3 border">{justification}</td>
            <td className="p-3 border text-red-600">{displayedContraindications}</td>
        </tr>
    );
}

const AITreatmentTable: React.FC<AITreatmentTableProps> = ({ treatments, language = "fr" }) => {
    const { t } = useUiLabels(language);
    const fixed = UI_LABELS_FR.residualClinicalUi;
    return (
        <div className="min-w-0 p-4 sm:p-6 bg-white shadow-lg rounded-xl border border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-blue-700">
                {t(fixed.proposedOptions)}
            </h2>

            <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
                <thead>
                <tr className="bg-gray-100">
                    <th className="p-3 border">{t(fixed.treatment)}</th>
                    <th className="p-3 border">{t(fixed.rationale)}</th>
                    <th className="p-3 border">{t(fixed.contraindications)}</th>
                </tr>
                </thead>

                <tbody>
                {treatments.map((t, i) => (
                    <TreatmentRow key={i} treatment={t} language={language} />
                ))}
                </tbody>
            </table>
            </div>
        </div>
    );
};

export default AITreatmentTable;
