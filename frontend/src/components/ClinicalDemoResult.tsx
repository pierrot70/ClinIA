import React, { useContext, useState } from "react";
import AITreatmentTable from "./AITreatmentTable";
import TreatmentCard from "./TreatmentCard";
import QuestionCard from "./QuestionCard";
import ClinicalRelevanceByAgeChart from "./ClinicalRelevanceByAgeChart";

import { ClinicalAnalysis } from "../types/clinical";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";

// Type hybride pour compatibilité ascendante
type ClinicalDemoResultData = Partial<ClinicalAnalysis> & {
  questions?: any[];
  summary?: string;
  error?: string;
  errorCode?: string;
  relevanceByAgeChart?: {
    title: string;
    subtitle: string;
    interpretationNote: string;
    ageBuckets: string[];
    levelLabels: Record<1 | 2 | 3 | 4 | 5, string>;
    series: Array<{
      name: string;
      values: Array<1 | 2 | 3 | 4 | 5>;
    }>;
    sources: Array<{
      label: string;
      url: string;
    }>;
  };
};

interface ClinicalDemoResultProps {
  demoData: ClinicalDemoResultData;
  sourceMode?: string;
  realAI?: boolean;
  patientDisplayName?: string;
  canReverify?: boolean;
  onReverify?: () => void;
  reverifyLoading?: boolean;
  canCopyRequest?: boolean;
  onCopyRequest?: () => void;
  copyRequestFeedback?: string | null;
}

function ResultAccordion({
  title,
  hint,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white shadow-sm"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
            {hint}
          </p>
        </div>
        <span className="text-2xl font-semibold text-gray-500" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div className="border-t border-gray-100 px-4 py-4">{children}</div> : null}
    </section>
  );
}

function buildPatientSummaryLabel(patientDisplayName?: string) {
  if (!patientDisplayName) {
    return "Résumé patient généré par ClinIA.";
  }

  return `Résumé patient (${patientDisplayName}) généré par ClinIA.`;
}

function hasRenderableValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

function truncateText(value: string, maxLength = 220) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildDynamicQuestions({
  summary,
  treatments,
}: {
  summary?: string;
  treatments?: Array<Record<string, any>>;
}) {
  if (!summary && (!Array.isArray(treatments) || treatments.length === 0)) {
    return [];
  }

  const questions = [];
  const topTreatment = Array.isArray(treatments) ? treatments[0] : null;

  if (summary) {
    questions.push({
      question: "Quel est le profil clinique principal retenu ici ?",
      answer: truncateText(summary),
    });
  }

  if (topTreatment?.name) {
    const justification =
      topTreatment.justification ||
      topTreatment.indication ||
      topTreatment.summary ||
      "Cette option ressort dans le contexte clinique actuel.";

    questions.push({
      question: `Pourquoi ${topTreatment.name} ressort-il comme option a discuter ?`,
      answer: truncateText(String(justification)),
    });
  }

  if (topTreatment?.monitoring && Array.isArray(topTreatment.monitoring) && topTreatment.monitoring.length > 0) {
    questions.push({
      question: "Quels points de surveillance devraient retenir l'attention ?",
      answer: truncateText(topTreatment.monitoring.join(", ")),
    });
  }

  if (
    topTreatment?.contraindications &&
    Array.isArray(topTreatment.contraindications) &&
    topTreatment.contraindications.length > 0
  ) {
    questions.push({
      question: "Quelles contre-indications ou limites doivent etre revues ?",
      answer: truncateText(topTreatment.contraindications.join(", ")),
    });
  }

  return questions.slice(0, 3);
}

const ClinicalDemoResult: React.FC<ClinicalDemoResultProps> = ({
  demoData,
  sourceMode,
  realAI,
  patientDisplayName,
  canReverify,
  onReverify,
  reverifyLoading,
  canCopyRequest,
  onCopyRequest,
  copyRequestFeedback,
}) => {
  const i18n = useContext(HomeI18nContext) || { locale: "fr" };
  const targetLang = i18n.locale;
  const resultLabels = labels.clinicalDemo.resultAccordions;
  const { translated: summarySectionTitle } = useTranslation({ text: resultLabels.summaryTitle, targetLang });
  const { translated: summarySectionHint } = useTranslation({ text: resultLabels.summaryHint, targetLang });
  const { translated: recommendationsSectionTitle } = useTranslation({ text: resultLabels.recommendationsTitle, targetLang });
  const { translated: recommendationsSectionHint } = useTranslation({ text: resultLabels.recommendationsHint, targetLang });
  const { translated: questionsSectionTitle } = useTranslation({ text: resultLabels.questionsTitle, targetLang });
  const { translated: questionsSectionHint } = useTranslation({ text: resultLabels.questionsHint, targetLang });
  const { translated: chartSectionTitle } = useTranslation({ text: resultLabels.chartTitle, targetLang });
  const { translated: chartSectionHint } = useTranslation({ text: resultLabels.chartHint, targetLang });
  const {
    treatments,
    questions,
    summary,
    error,
    errorCode,
    clinical_summary,
    recommendations,
    initial_evaluation_recommendations,
    treatment_options,
    follow_up_and_monitoring,
    other_ai_fields,
    relevanceByAgeChart,
  } = demoData || {};
  const top = treatments && treatments[0];
  const patientSummaryLabel = buildPatientSummaryLabel(patientDisplayName);
  const dynamicQuestions = buildDynamicQuestions({
    summary,
    treatments: Array.isArray(treatments)
      ? (treatments as Array<Record<string, any>>)
      : [],
  });
  const renderedQuestions = dynamicQuestions.length > 0 ? dynamicQuestions : questions ?? [];

  // Gestion des erreurs IA
  if (error) {
    const helpMessage =
      errorCode === "OPENAI_ANALYZE_SATURATED"
        ? "Le service est temporairement sature. Reessayez plus tard ou contactez un administrateur."
        : "Merci de verifier les donnees cliniques et reessayer.";

    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-6 rounded-xl text-center">
        <h2 className="text-lg font-semibold mb-2">Erreur d'analyse IA</h2>
        <p className="mb-2">{error}</p>
        <p>{helpMessage}</p>
      </div>
    );
  }

  // Détecter si on a des détails IA même sans traitements
  const hasIADetails = [
    clinical_summary,
    recommendations,
    initial_evaluation_recommendations,
    treatment_options,
    follow_up_and_monitoring,
    other_ai_fields,
  ].some(hasRenderableValue);

  // Si aucun traitement mais on a des détails IA, afficher les sections IA avancées
  if ((!treatments || treatments.length === 0) && hasIADetails) {
    return (
      <div className="space-y-6">
        <ResultAccordion title={summarySectionTitle} hint={summarySectionHint} defaultOpen={false}>
          <h2 className="text-lg font-semibold mb-2">{patientSummaryLabel}</h2>
          <p className="text-gray-700 text-sm mb-4">{summary || patientSummaryLabel}</p>
          {clinical_summary && (
            <div className="bg-gray-50 border rounded-lg p-3 mb-2">
              <h3 className="font-semibold text-sm mb-1">Résumé clinique IA</h3>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{clinical_summary}</p>
            </div>
          )}
        </ResultAccordion>

        {(recommendations || initial_evaluation_recommendations || treatment_options || follow_up_and_monitoring) && (
          <ResultAccordion title={recommendationsSectionTitle} hint={recommendationsSectionHint} defaultOpen={false}>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-md font-semibold text-emerald-900 mb-2">Recommandations IA</h2>
            {/* Bloc générique pour recommendations */}
            {recommendations && (
              <div className="mb-2">
                <h3 className="font-semibold text-sm mb-1">Recommandations</h3>
                {typeof recommendations === 'string' && (
                  <div className="text-xs text-gray-800 mb-1">{recommendations}</div>
                )}
                {Array.isArray(recommendations) && (
                  <ul className="list-disc pl-5 text-xs text-gray-800">
                    {recommendations.map((item: any, i: number) => (
                      <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                    ))}
                  </ul>
                )}
                {typeof recommendations === 'object' && !Array.isArray(recommendations) && recommendations !== null && (
                  <pre className="text-xs text-gray-700 bg-gray-100 rounded p-2 overflow-x-auto">{JSON.stringify(recommendations, null, 2)}</pre>
                )}
              </div>
            )}
            {/* Bloc générique pour initial_evaluation_recommendations */}
            {initial_evaluation_recommendations && (
              <div className="mb-2">
                <h3 className="font-semibold text-sm mb-1">Évaluation initiale</h3>
                {typeof initial_evaluation_recommendations === 'string' && (
                  <div className="text-xs text-gray-800 mb-1">{initial_evaluation_recommendations}</div>
                )}
                {Array.isArray(initial_evaluation_recommendations) && (
                  <ul className="list-disc pl-5 text-xs text-gray-800">
                    {initial_evaluation_recommendations.map((item: any, i: number) => (
                      <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                    ))}
                  </ul>
                )}
                {typeof initial_evaluation_recommendations === 'object' && !Array.isArray(initial_evaluation_recommendations) && initial_evaluation_recommendations !== null && (
                  <pre className="text-xs text-gray-700 bg-gray-100 rounded p-2 overflow-x-auto">{JSON.stringify(initial_evaluation_recommendations, null, 2)}</pre>
                )}
              </div>
            )}
            {/* Bloc générique pour treatment_options */}
            {treatment_options && (
              <div className="mb-2">
                <h3 className="font-semibold text-sm mb-1">Options thérapeutiques</h3>
                {typeof treatment_options === 'string' && (
                  <div className="text-xs text-gray-800 mb-1">{treatment_options}</div>
                )}
                {Array.isArray(treatment_options) && (
                  <ul className="list-disc pl-5 text-xs text-gray-800">
                    {treatment_options.map((item: any, i: number) => (
                      <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                    ))}
                  </ul>
                )}
                {typeof treatment_options === 'object' && !Array.isArray(treatment_options) && treatment_options !== null && (
                  <pre className="text-xs text-gray-700 bg-gray-100 rounded p-2 overflow-x-auto">{JSON.stringify(treatment_options, null, 2)}</pre>
                )}
              </div>
            )}
            {/* Bloc générique pour follow_up_and_monitoring */}
            {follow_up_and_monitoring && (
              <div className="mb-2">
                <h3 className="font-semibold text-sm mb-1">Suivi et surveillance</h3>
                {typeof follow_up_and_monitoring === 'string' && (
                  <div className="text-xs text-gray-800 mb-1">{follow_up_and_monitoring}</div>
                )}
                {Array.isArray(follow_up_and_monitoring) && (
                  <ul className="list-disc pl-5 text-xs text-gray-800">
                    {follow_up_and_monitoring.map((item: any, i: number) => (
                      <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                    ))}
                  </ul>
                )}
                {typeof follow_up_and_monitoring === 'object' && !Array.isArray(follow_up_and_monitoring) && follow_up_and_monitoring !== null && (
                  <pre className="text-xs text-gray-700 bg-gray-100 rounded p-2 overflow-x-auto">{JSON.stringify(follow_up_and_monitoring, null, 2)}</pre>
                )}
              </div>
            )}
            </div>
          </ResultAccordion>
        )}

        {other_ai_fields && Object.keys(other_ai_fields).length > 0 && (
          <ResultAccordion title={questionsSectionTitle} hint={questionsSectionHint} defaultOpen={false}>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-md font-semibold text-blue-900 mb-2">Autres recommandations IA</h2>
            {Object.entries(other_ai_fields).map(([key, value]) => (
              <div key={key} className="mb-2">
                <div className="font-semibold text-xs text-blue-800 mb-1">{key.replace(/_/g, ' ')}</div>
                {typeof value === 'string' && <div className="text-xs text-gray-800 mb-1">{value}</div>}
                {Array.isArray(value) && (
                  <ul className="list-disc pl-5 text-xs text-gray-800">
                    {value.map((item: any, i: number) => (
                      <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                    ))}
                  </ul>
                )}
                {typeof value === 'object' && !Array.isArray(value) && value !== null && (
                  <pre className="text-xs text-gray-700 bg-gray-100 rounded p-2 overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>
                )}
              </div>
            ))}
            </div>
          </ResultAccordion>
        )}
      </div>
    );
  }

  // Mapping IA ou démo
  const mappedTreatments = (treatments ?? []).map((t: any, i: number) => ({
    id: t.id ?? `ia-${i}`,
    name: t.name || t.shortName || "-",
    shortName: t.shortName ?? t.name ?? "IA",
    class: t.class ?? "",
    flags: Array.isArray(t.flags) ? t.flags : [],
    indication: t.indication ?? t.justification ?? "",
    dosage: t.dosage ?? "",
    duration: t.duration ?? "",
    contraindications: t.contraindications || t.flags || [],
    monitoring: t.monitoring ?? [],
    evidence_level: t.evidence_level ?? "C",
    justification: t.summary || t.indication || t.justification || "-",
    ...t,
  }));

  return (
    <div className="space-y-6">
      <ResultAccordion title={summarySectionTitle} hint={summarySectionHint} defaultOpen={false}>
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">{patientSummaryLabel}</h2>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              {canCopyRequest ? (
                <button
                  type="button"
                  onClick={onCopyRequest}
                  className="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-100"
                >
                  Copier la requete JSON
                </button>
              ) : null}
              {canReverify ? (
                <button
                  type="button"
                  onClick={onReverify}
                  disabled={reverifyLoading}
                  className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  {reverifyLoading
                    ? "Verification OpenAI en cours..."
                    : "Relancer pour verification (SUPERADMIN)"}
                </button>
              ) : null}
            </div>
            {copyRequestFeedback ? (
              <p className="text-xs text-sky-700">{copyRequestFeedback}</p>
            ) : null}
          </div>
        </div>
        <p className="text-gray-700 text-sm mb-4">{summary || patientSummaryLabel}</p>
        {clinical_summary && (
          <div className="bg-gray-50 border rounded-lg p-3 mb-2">
            <h3 className="font-semibold text-sm mb-1">Résumé clinique IA</h3>
            <p className="text-xs text-gray-700 whitespace-pre-wrap">{clinical_summary}</p>
          </div>
        )}
      </ResultAccordion>

      {(recommendations || initial_evaluation_recommendations || treatment_options || follow_up_and_monitoring || mappedTreatments.length > 0) && (
        <ResultAccordion title={recommendationsSectionTitle} hint={recommendationsSectionHint} defaultOpen={false}>
        {(recommendations || initial_evaluation_recommendations || treatment_options || follow_up_and_monitoring) && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm mb-4">
          <h2 className="text-md font-semibold text-emerald-900 mb-2">Recommandations IA</h2>
          {recommendations && (
            <div className="mb-2">
              <h3 className="font-semibold text-sm mb-1">Recommandations</h3>
              {typeof recommendations === 'string' && (
                <div className="text-xs text-gray-800 mb-1">{recommendations}</div>
              )}
              {Array.isArray(recommendations) && (
                <ul className="list-disc pl-5 text-xs text-gray-800">
                  {recommendations.map((item: any, i: number) => (
                    <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                  ))}
                </ul>
              )}
              {typeof recommendations === 'object' && !Array.isArray(recommendations) && recommendations !== null && (
                <pre className="text-xs text-gray-700 bg-gray-100 rounded p-2 overflow-x-auto">{JSON.stringify(recommendations, null, 2)}</pre>
              )}
            </div>
          )}
          {initial_evaluation_recommendations && (
            <div className="mb-2">
              <h3 className="font-semibold text-sm mb-1">Évaluation initiale</h3>
              <ul className="list-disc pl-5 text-xs text-gray-800">
                {initial_evaluation_recommendations.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {treatment_options && (
            <div className="mb-2">
              <h3 className="font-semibold text-sm mb-1">Options thérapeutiques</h3>
              {Object.entries(treatment_options).map(([key, value]: [string, any], i) => (
                <div key={key} className="mb-2">
                  <div className="font-semibold text-xs text-emerald-800 mb-1">{key.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-gray-800 mb-1">{value.recommendation}</div>
                  {Array.isArray(value.details) && (
                    <ul className="list-disc pl-5 text-xs text-gray-800">
                      {value.details.map((d: string, j: number) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {follow_up_and_monitoring && (
            <div className="mb-2">
              <h3 className="font-semibold text-sm mb-1">Suivi et surveillance</h3>
              <ul className="list-disc pl-5 text-xs text-gray-800">
                {follow_up_and_monitoring.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {mappedTreatments.length > 0 && !hasIADetails && (
        <>
          <section className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Traitement suggéré</h2>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">{mappedTreatments[0]?.name}</span> est présenté comme option prioritaire à discuter selon le contexte clinique.
              </p>
            </div>
            <div className="text-right text-sm max-w-[16rem]">
              <div className="text-xs text-gray-500">Repère clinique</div>
              <div className="text-base font-semibold text-primary">
                Données simulées sans score chiffré
              </div>
            </div>
          </section>

          <section>
            <AITreatmentTable treatments={mappedTreatments} />
          </section>
        </>
      )}

      {/* Cartes de traitements */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(mappedTreatments ?? []).map((t, i) => (
          <TreatmentCard
            key={i}
            treatment={t}
            sourceMode={sourceMode}
            realAI={realAI}
          />
        ))}
      </section>
      </ResultAccordion>
      )}

      {relevanceByAgeChart && (
        <ResultAccordion title={chartSectionTitle} hint={chartSectionHint} defaultOpen={false}>
          <ClinicalRelevanceByAgeChart
            title={relevanceByAgeChart.title}
            subtitle={relevanceByAgeChart.subtitle}
            interpretationNote={relevanceByAgeChart.interpretationNote}
            ageBuckets={relevanceByAgeChart.ageBuckets}
            levelLabels={relevanceByAgeChart.levelLabels}
            series={relevanceByAgeChart.series}
            sources={relevanceByAgeChart.sources}
          />
        </ResultAccordion>
      )}

      <ResultAccordion title={questionsSectionTitle} hint={questionsSectionHint} defaultOpen={false}>
        <h2 className="text-lg font-semibold mb-2">
          {dynamicQuestions.length === 0
            ? "Questions fréquentes (simulation)"
            : "Questions cliniques contextuelles"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(renderedQuestions ?? []).map((q, i) => (
            <QuestionCard key={i} question={q.question ?? q} answer={q.answer ?? ""} />
          ))}
        </div>
      </ResultAccordion>
    </div>
  );
};

export default ClinicalDemoResult;
