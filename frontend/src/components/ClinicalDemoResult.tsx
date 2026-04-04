import React from "react";
import AITreatmentTable from "./AITreatmentTable";
import TreatmentCard from "./TreatmentCard";
import ChartCard from "./ChartCard";
import QuestionCard from "./QuestionCard";



import { ClinicalAnalysis } from "../types/clinical";

// Type hybride pour compatibilité ascendante
type ClinicalDemoResultData = Partial<ClinicalAnalysis> & {
  questions?: any[];
  summary?: string;
  error?: string;
};

interface ClinicalDemoResultProps {
  demoData: ClinicalDemoResultData;
  sourceMode?: string;
  realAI?: boolean;
  patientDisplayName?: string;
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

const ClinicalDemoResult: React.FC<ClinicalDemoResultProps> = ({
  demoData,
  sourceMode,
  realAI,
  patientDisplayName,
}) => {
  const {
    treatments,
    questions,
    summary,
    error,
    clinical_summary,
    recommendations,
    initial_evaluation_recommendations,
    treatment_options,
    follow_up_and_monitoring,
    other_ai_fields,
  } = demoData || {};
  const top = treatments && treatments[0];
  const patientSummaryLabel = buildPatientSummaryLabel(patientDisplayName);

  // Gestion des erreurs IA
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-6 rounded-xl text-center">
        <h2 className="text-lg font-semibold mb-2">Erreur d'analyse IA</h2>
        <p className="mb-2">{error}</p>
        <p>Merci de vérifier les données cliniques et réessayer.</p>
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
        {/* Résumé patient */}
        <section>
          <h2 className="text-lg font-semibold mb-2">{patientSummaryLabel}</h2>
          <p className="text-gray-700 text-sm mb-4">{summary || patientSummaryLabel}</p>
          {clinical_summary && (
            <div className="bg-gray-50 border rounded-lg p-3 mb-2">
              <h3 className="font-semibold text-sm mb-1">Résumé clinique IA</h3>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{clinical_summary}</p>
            </div>
          )}
        </section>

        {/* Recommandations IA détaillées et dynamiques */}
        {(recommendations || initial_evaluation_recommendations || treatment_options || follow_up_and_monitoring) && (
          <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm mb-4">
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
          </section>
        )}

        {/* Affichage dynamique des champs IA inconnus */}
        {other_ai_fields && Object.keys(other_ai_fields).length > 0 && (
          <section className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm mb-4">
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
          </section>
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
    efficacy: typeof t.efficacy === "number" ? Math.round(t.efficacy * 100) : 0,
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
      {/* Résumé patient */}
      <section>
        <h2 className="text-lg font-semibold mb-2">{patientSummaryLabel}</h2>
        <p className="text-gray-700 text-sm mb-4">{summary || patientSummaryLabel}</p>
        {clinical_summary && (
          <div className="bg-gray-50 border rounded-lg p-3 mb-2">
            <h3 className="font-semibold text-sm mb-1">Résumé clinique IA</h3>
            <p className="text-xs text-gray-700 whitespace-pre-wrap">{clinical_summary}</p>
          </div>
        )}
      </section>

      {/* Recommandations IA détaillées */}
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

      {/* Traitement suggéré et table seulement si traitements non vides et pas de recommandations IA cancer */}
      {mappedTreatments.length > 0 && !hasIADetails && (
        <>
          {/* Traitement suggéré */}
          <section className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Traitement suggéré</h2>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">{mappedTreatments[0]?.name}</span> est proposé comme agent de première ligne.
              </p>
            </div>
            <div className="text-right text-sm">
              <div className="text-xs text-gray-500">Efficacité</div>
              <div className="text-3xl font-semibold text-primary">{mappedTreatments[0]?.efficacy ?? 0}%</div>
            </div>
          </section>

          {/* Table des traitements */}
          <section>
            <AITreatmentTable treatments={mappedTreatments} />
          </section>
        </>
      )}

      {/* Cartes de traitements */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(mappedTreatments ?? []).map((t, i) => (
          <TreatmentCard key={i} treatment={t} />
        ))}
      </section>

      {/* Graphiques d'efficacité et d'effets secondaires */}
      <section>
        <ChartCard treatments={mappedTreatments ?? []} />
      </section>

      {/* Questions fréquentes */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Questions fréquentes (simulation)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(questions ?? []).map((q, i) => (
            <QuestionCard key={i} question={q.question ?? q} answer={q.answer ?? ""} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default ClinicalDemoResult;
