import React from "react";
import AITreatmentTable from "./AITreatmentTable";
import TreatmentCard from "./TreatmentCard";
import ChartCard from "./ChartCard";
import QuestionCard from "./QuestionCard";

interface ClinicalDemoResultProps {
  demoData: {
    treatments: any[];
    questions: any[];
    summary?: string;
    // autres champs à ajouter si besoin
  };
  sourceMode?: string;
  realAI?: boolean;
}

const ClinicalDemoResult: React.FC<ClinicalDemoResultProps> = ({ demoData, sourceMode, realAI }) => {
  const { treatments, questions, summary } = demoData;
  const top = treatments[0];

  return (
    <div className="space-y-6">
      {/* Résumé patient */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Résumé patient généré par ClinIA.</h2>
        <p className="text-gray-700 text-sm mb-4">{summary || "Résumé patient généré par ClinIA."}</p>
      </section>

      {/* Traitement suggéré (simulation) */}
      <section className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Traitement suggéré (simulation)</h2>
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{top.name}</span> est proposé comme agent de première ligne.
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="text-xs text-gray-500">Efficacité simulée</div>
          <div className="text-3xl font-semibold text-primary">{Math.round(top.efficacy * 100)}%</div>
        </div>
      </section>

      {/* Table des traitements */}
      <section>
        <AITreatmentTable treatments={treatments.map(t => ({
          name: t.name,
          justification: t.summary || t.indication || "-",
          contraindications: t.flags || [],
          efficacy: t.efficacy || 0
        }))} />
      </section>

      {/* Cartes de traitements */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {treatments.map((t, i) => (
          <TreatmentCard key={i} treatment={t} />
        ))}
      </section>

      {/* Graphiques d'efficacité et d'effets secondaires */}
      <section>
        <ChartCard treatments={treatments} />
      </section>

      {/* Questions fréquentes */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Questions fréquentes (simulation)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {questions.map((q, i) => (
            <QuestionCard key={i} question={q.question} answer={q.answer} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default ClinicalDemoResult;
