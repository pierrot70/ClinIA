import React from "react";
import { hypertensionTreatments } from "../data/hypertension";

const QuickMode: React.FC = () => {
  const [first, second, third] = hypertensionTreatments;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">
          Mode rapide (démo)
        </h1>
        <p className="text-sm text-gray-600">
          Exemple de présentation &quot;6 secondes&quot; : 1 traitement recommandé,
          2 alternatives et 3 phrases pour l&apos;essentiel. Contenu fictif.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          Recommandation simulée
        </p>
        <p className="text-sm text-gray-800">
          1️⃣ <span className="font-semibold">{first.name}</span> – agent de première
          ligne, très bon contrôle tensionnel, profil de tolérance favorable.
        </p>
        <p className="text-sm text-gray-800">
          2️⃣ <span className="font-semibold">{second.name}</span> – alternative
          pertinente, utile chez les patients avec comorbidités cardiaques.
        </p>
        <p className="text-sm text-gray-800">
          3️⃣ <span className="font-semibold">{third.name}</span> – particulièrement
          intéressante en cas de diabète ou de néphropathie (simulation).
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Exemple de format ultra-condensé que ClinIA pourrait générer à partir
          de données validées. Ici, toutes les informations sont fictives.
        </p>
      </section>
    </div>
  );
};

export default QuickMode;
