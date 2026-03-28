import type { ClinicalAnalysis } from "../types/clinical";

type Props = {
    data: ClinicalAnalysis;
    serviceMode: "real" | "mock" | "degraded" | null;
};

import { useTranslation } from "../hooks/useTranslation";
import { useContext, useState, useEffect } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";

type PropsWithLang = Props & { targetLang?: string };

export function ClinicalResultPage({ data, serviceMode, targetLang }: PropsWithLang) {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const lang = targetLang || i18n.locale;
    const {
        diagnosis,
        patient_summary,
        treatments,
        alternatives,
        red_flags,
        meta,
    } = data;

    // Traductions dynamiques
        const { translated: degradedTitle, loading: loadingDegradedTitle, error: errorDegradedTitle } = useTranslation({ text: "Résultat généré en mode dégradé", targetLang: lang });
        const { translated: degradedMsg, loading: loadingDegradedMsg, error: errorDegradedMsg } = useTranslation({ text: "Le service avancé est temporairement indisponible. Nous travaillons activement à rétablir le service (SLA 99.999%).", targetLang: lang });
        const { translated: clinicalResultTitle, loading: loadingClinicalResultTitle, error: errorClinicalResultTitle } = useTranslation({ text: "Résultat clinique", targetLang: lang });
        const { translated: suspectedDiagnosisLabel, loading: loadingSuspectedDiagnosisLabel, error: errorSuspectedDiagnosisLabel } = useTranslation({ text: "Diagnostic suspecté", targetLang: lang });
        const { translated: patientSummaryLabel, loading: loadingPatientSummaryLabel, error: errorPatientSummaryLabel } = useTranslation({ text: "Résumé patient", targetLang: lang });
        const { translated: noSummaryLabel, loading: loadingNoSummaryLabel, error: errorNoSummaryLabel } = useTranslation({ text: "Aucun résumé patient disponible.", targetLang: lang });
        const { translated: treatmentsLabel, loading: loadingTreatmentsLabel, error: errorTreatmentsLabel } = useTranslation({ text: "Traitements proposés", targetLang: lang });
        const { translated: noTreatmentsLabel, loading: loadingNoTreatmentsLabel, error: errorNoTreatmentsLabel } = useTranslation({ text: "Aucun traitement structuré disponible.", targetLang: lang });
        const { translated: modelLabel, loading: loadingModelLabel, error: errorModelLabel } = useTranslation({ text: "Modèle", targetLang: lang });
        const { translated: confidenceLabel, loading: loadingConfidenceLabel, error: errorConfidenceLabel } = useTranslation({ text: "Confiance", targetLang: lang });

        const { translated: loadingLabel } = useTranslation({ text: "Chargement...", targetLang: lang });

        const [showTranslationError, setShowTranslationError] = useState<string | null>(null);
        useEffect(() => {
            if (errorDegradedTitle) setShowTranslationError(errorDegradedTitle);
            else if (errorDegradedMsg) setShowTranslationError(errorDegradedMsg);
            else if (errorClinicalResultTitle) setShowTranslationError(errorClinicalResultTitle);
            else if (errorSuspectedDiagnosisLabel) setShowTranslationError(errorSuspectedDiagnosisLabel);
            else if (errorPatientSummaryLabel) setShowTranslationError(errorPatientSummaryLabel);
            else if (errorNoSummaryLabel) setShowTranslationError(errorNoSummaryLabel);
            else if (errorTreatmentsLabel) setShowTranslationError(errorTreatmentsLabel);
            else if (errorNoTreatmentsLabel) setShowTranslationError(errorNoTreatmentsLabel);
            else if (errorModelLabel) setShowTranslationError(errorModelLabel);
            else if (errorConfidenceLabel) setShowTranslationError(errorConfidenceLabel);
            else setShowTranslationError(null);
        }, [errorDegradedTitle, errorDegradedMsg, errorClinicalResultTitle, errorSuspectedDiagnosisLabel, errorPatientSummaryLabel, errorNoSummaryLabel, errorTreatmentsLabel, errorNoTreatmentsLabel, errorModelLabel, errorConfidenceLabel]);

        const renderLabel = (label: string, loading: boolean) => {
            if (loading) return <span style={{ opacity: 0.6 }}>{loadingLabel}</span>;
            return label;
        };

    return (
        <div className="bg-white p-6 rounded border space-y-6">
            {showTranslationError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                        <h2 className="text-lg font-semibold text-red-700 mb-2">Translation error</h2>
                        <p className="text-sm text-gray-800 mb-4">{showTranslationError}</p>
                        <button className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700" onClick={() => setShowTranslationError(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
            {serviceMode === "degraded" && (
                <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-4 text-sm">
                    <strong>{renderLabel(degradedTitle, loadingDegradedTitle)}</strong>
                    <p className="mt-1">{renderLabel(degradedMsg, loadingDegradedMsg)}</p>
                </div>
            )}

            <h2 className="text-xl font-semibold">{renderLabel(clinicalResultTitle, loadingClinicalResultTitle)}</h2>


            <section>
                <h3 className="font-medium">{renderLabel(suspectedDiagnosisLabel, loadingSuspectedDiagnosisLabel)}</h3>
                <p>{data.diagnosis?.suspected ?? "—"}</p>
                {data.diagnosis?.justification && (
                    <p className="text-sm text-gray-600">
                        {useTranslation({ text: data.diagnosis.justification, targetLang: lang }).translated}
                    </p>
                )}
            </section>

            <section>
                <h3 className="font-medium">{renderLabel(patientSummaryLabel, loadingPatientSummaryLabel)}</h3>
                <p>
                    {data.patient_summary?.plain_language
                        ? useTranslation({ text: data.patient_summary.plain_language, targetLang: lang }).translated
                        : renderLabel(noSummaryLabel, loadingNoSummaryLabel)}
                </p>
            </section>

            <section>
                <h3 className="font-medium">{renderLabel(treatmentsLabel, loadingTreatmentsLabel)}</h3>
                {Array.isArray(data.treatments) && data.treatments.length > 0 ? (
                    <ul className="list-disc ml-5">
                        {data.treatments.map((t, i) => (
                            <li key={i}>{t?.name ?? "—"}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500">
                        {renderLabel(noTreatmentsLabel, loadingNoTreatmentsLabel)}
                    </p>
                )}
            </section>

            <section className="text-xs text-gray-500 pt-4 border-t">
                <div>{renderLabel(modelLabel, loadingModelLabel)} : {data.meta?.model ?? "—"}</div>
                <div>
                    {renderLabel(confidenceLabel, loadingConfidenceLabel)} :{" "}
                    {typeof data.meta?.confidence_score === "number"
                        ? Math.round(data.meta.confidence_score * 100) + "%"
                        : "—"}
                </div>
            </section>
        </div>
    );
}
