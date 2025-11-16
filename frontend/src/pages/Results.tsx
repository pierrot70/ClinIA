import React from "react";
import { useLocation, Link } from "react-router-dom";
import { hypertensionTreatments, anticipatedQuestions } from "../data/hypertension";
import TreatmentCard from "../components/TreatmentCard";
import ChartCard from "../components/ChartCard";
import QuestionCard from "../components/QuestionCard";

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

const Results: React.FC = () => {
  const query = useQuery();
  const q = query.get("q") || "Hypertension essentielle grade 1";

  const top = hypertensionTreatments[0];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          Diagnostic saisi
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">{q}</h1>
        <p className="text-sm text-gray-600 max-w-2xl">
          Résumé généré à partir de données simulées pour démontrer la façon
          dont l&apos;application pourrait présenter des options thérapeutiques
          basées sur les lignes directrices et la littérature scientifique.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-1">
            Traitement suggéré (simulation)
          </h2>
          <p className="text-sm text-gray-700">
            Pour ce scénario, <span className="font-semibold">{top.name}</span>{" "}
            est proposé comme agent de première ligne, avec un excellent rapport
            efficacité / tolérance.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Ce contenu est intégralement fictif et illustratif. Les décisions
            cliniques réelles nécessitent l&apos;avis d&apos;un médecin et des
            sources validées.
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="text-xs text-gray-500">Efficacité simulée</div>
          <div className="text-3xl font-semibold text-primary">
            {Math.round(top.efficacy * 100)}%
          </div>
          <Link
            to="/quick"
            className="mt-2 inline-block text-xs text-primary hover:underline"
          >
            Voir le mode résumé &rarr;
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {hypertensionTreatments.map((t) => (
          <TreatmentCard key={t.id} treatment={t} />
        ))}
      </section>

      <section>
        <ChartCard treatments={hypertensionTreatments} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Questions que vous pourriez vous poser (simulation)
        </h2>
        <p className="text-xs text-gray-500">
          Ces exemples illustrent la manière dont ClinIA pourrait anticiper les
          interrogations fréquentes d&apos;un clinicien et proposer une réponse
          structurée.
        </p>
        <div className="space-y-2">
          {anticipatedQuestions.map((qa) => (
            <QuestionCard
              key={qa.question}
              question={qa.question}
              answer={qa.answer}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Results;
