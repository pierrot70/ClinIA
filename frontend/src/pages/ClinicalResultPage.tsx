import type { ClinicalAnalysis } from "../types/clinical";

type Props = {
    data: ClinicalAnalysis;
    serviceMode: "real" | "mock" | "degraded" | null;
};

import { useTranslation } from "../hooks/useTranslation";
import { useContext } from "react";
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

        const renderLabel = (label: string, loading: boolean, error?: string) => {
            if (loading) return <span style={{ opacity: 0.6 }}>{loadingLabel}</span>;
            if (error) return <span style={{ color: 'red' }}>{error}</span>;
            return label;
        };

    return (
        <div className="bg-white p-6 rounded border space-y-6">
            {serviceMode === "degraded" && (
                <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-4 text-sm">
                    <strong>{renderLabel(degradedTitle, loadingDegradedTitle, errorDegradedTitle ?? undefined)}</strong>
                    <p className="mt-1">{renderLabel(degradedMsg, loadingDegradedMsg, errorDegradedMsg ?? undefined)}</p>
                </div>
            )}

            <h2 className="text-xl font-semibold">{renderLabel(clinicalResultTitle, loadingClinicalResultTitle, errorClinicalResultTitle ?? undefined)}</h2>

            <section>
                <h3 className="font-medium">{renderLabel(suspectedDiagnosisLabel, loadingSuspectedDiagnosisLabel, errorSuspectedDiagnosisLabel ?? undefined)}</h3>
                <p>{data.diagnosis?.suspected ?? "—"}</p>
                {data.diagnosis?.justification && (
                    <p className="text-sm text-gray-600">
                        {data.diagnosis.justification}
                    </p>
                )}
            </section>

            <section>
                <h3 className="font-medium">{renderLabel(patientSummaryLabel, loadingPatientSummaryLabel, errorPatientSummaryLabel ?? undefined)}</h3>
                <p>
                    {data.patient_summary?.plain_language ?? renderLabel(noSummaryLabel, loadingNoSummaryLabel, errorNoSummaryLabel ?? undefined)}
                </p>
            </section>

            <section>
                <h3 className="font-medium">{renderLabel(treatmentsLabel, loadingTreatmentsLabel, errorTreatmentsLabel ?? undefined)}</h3>
                {Array.isArray(data.treatments) && data.treatments.length > 0 ? (
                    <ul className="list-disc ml-5">
                        {data.treatments.map((t, i) => (
                            <li key={i}>{t?.name ?? "—"}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500">
                        {renderLabel(noTreatmentsLabel, loadingNoTreatmentsLabel, errorNoTreatmentsLabel ?? undefined)}
                    </p>
                )}
            </section>

            <section className="text-xs text-gray-500 pt-4 border-t">
                <div>{renderLabel(modelLabel, loadingModelLabel, errorModelLabel ?? undefined)} : {data.meta?.model ?? "—"}</div>
                <div>
                    {renderLabel(confidenceLabel, loadingConfidenceLabel, errorConfidenceLabel ?? undefined)} :{" "}
                    {typeof data.meta?.confidence_score === "number"
                        ? Math.round(data.meta.confidence_score * 100) + "%"
                        : "—"}
                </div>
            </section>
        </div>
    );
}
