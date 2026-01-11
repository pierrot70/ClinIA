import React from "react";
import SearchBar from "../components/SearchBar";

const Home: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col items-center gap-10">
      <section className="text-center max-w-2xl space-y-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
          Gagnez du temps après chaque diagnostic.
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          ClinIA propose, à partir d&apos;un diagnostic, des options de traitement
          classées selon leur efficacité, leur tolérance et les données actuelles
          — le tout présenté en quelques secondes, sous forme de synthèse claire.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 inline-block px-3 py-1 rounded-full">
          Prototype avec données simulées – non destiné à la pratique clinique réelle.
        </p>
      </section>

      <SearchBar />

      <section className="grid sm:grid-cols-3 gap-4 w-full mt-8">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm mb-1">6 secondes de lecture</h3>
          <p className="text-xs text-gray-600">
            Un résumé ultra-concis : 1 traitement recommandé, 2 alternatives, 3 phrases
            pour comprendre l&apos;essentiel.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm mb-1">Graphiques explicites</h3>
          <p className="text-xs text-gray-600">
            Efficacité comparative, profil d&apos;effets secondaires et pertinence clinique
            visualisés en un coup d&apos;oeil.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-sm mb-1">Questions anticipées</h3>
          <p className="text-xs text-gray-600">
            L&apos;interface suggère des questions fréquentes et affiche des réponses structurées,
            pour réduire la charge cognitive.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Home;
