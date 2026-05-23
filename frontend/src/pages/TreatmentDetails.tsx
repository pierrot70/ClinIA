import React from "react";
import { useParams, Link } from "react-router-dom";
import { hypertensionTreatments } from "../data/hypertension";

function getClinicalRelevanceLabel(flags: string[] = []) {
  if (flags.includes("wellTolerated") && flags.includes("monitoring")) {
    return "A evaluer selon le contexte";
  }

  if (flags.includes("wellTolerated")) {
    return "Option courante";
  }

  if (flags.includes("monitoring")) {
    return "Option a surveiller";
  }

  return "A discuter";
}

const TreatmentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const treatment = hypertensionTreatments.find(
    (t) => t.id === decodeURIComponent(id || "")
  );
  const flags = Array.isArray(treatment?.flags) ? treatment.flags : [];
  const relevanceLabel = getClinicalRelevanceLabel(flags);

  if (!treatment) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-sm text-gray-600 mb-4">
          Traitement introuvable (données simulées).
        </p>
        <Link to="/results" className="text-primary text-sm hover:underline">
          &larr; Retour aux résultats
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          Données simulées
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">
          {treatment.name}
        </h1>
        <p className="text-sm text-gray-600">{treatment.class}</p>
      </div>

      <section className="grid sm:grid-cols-3 gap-4 text-sm">
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Pertinence clinique</div>
          <div className="text-lg font-semibold text-primary">
            {relevanceLabel}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Repère qualitatif simulé, non quantifié.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Surveillance</div>
          <div className="text-sm font-semibold text-amber-600">
            {flags.includes("monitoring") ? "Requise selon le profil" : "Standard"}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Formulation textuelle simulée, plus crédible qu&apos;un score arbitraire.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Remarques</div>
          <ul className="text-xs text-gray-700 list-disc ml-4 mt-1">
            {flags.includes("wellTolerated") && (
              <li>Profil de tolérance globalement favorable.</li>
            )}
            {flags.includes("monitoring") && (
              <li>Surveillance de la fonction rénale ou électrolytique.</li>
            )}
          </ul>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-sm text-gray-700 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Comment interpréter ces informations ?
        </h2>
        <p>{treatment.details}</p>
        <p className="text-xs text-gray-500">
          Cette fiche est un exemple illustratif. Dans une version réelle,
          ClinIA s&apos;appuierait sur des lignes directrices, des méta-analyses
          et les politiques locales, en collaboration avec un comité clinique.
        </p>
      </section>

      <Link to="/results" className="text-primary text-sm hover:underline">
        &larr; Retour aux résultats simulés
      </Link>
    </div>
  );
};

export default TreatmentDetails;
