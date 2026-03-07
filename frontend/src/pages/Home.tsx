import React from "react";
import SearchBar from "../components/SearchBar";

const Home: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 flex flex-col items-center gap-8 sm:gap-10">
      <section className="relative w-full overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="absolute -top-24 -left-24 h-56 w-56 rounded-full bg-sky-100 blur-3xl opacity-60" />
        <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-indigo-100 blur-3xl opacity-60" />

        <div className="relative px-6 py-10 sm:px-10 sm:py-14 text-center max-w-3xl mx-auto space-y-5">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            Gagnez du temps après chaque diagnostic.
          </h1>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
            ClinIA propose, à partir d&apos;un diagnostic, des options de traitement
            classées selon leur efficacité, leur tolérance et les données actuelles
            — le tout présenté en quelques secondes, sous forme de synthèse claire,
            avec saisie clinique anonymisée.
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 inline-block px-3 py-1 rounded-full">
            Prototype avec données simulées – non destiné à la pratique clinique réelle.
          </p>

          <div className="pt-1 sm:pt-2">
            <SearchBar />
          </div>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-4 w-full">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="font-semibold text-sm mb-2">6 secondes de lecture</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Un résumé ultra-concis : 1 traitement recommandé, 2 alternatives, 3 phrases
            pour comprendre l&apos;essentiel.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="font-semibold text-sm mb-2">Graphiques explicites</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Efficacité comparative, profil d&apos;effets secondaires et pertinence clinique
            visualisés en un coup d&apos;oeil.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="font-semibold text-sm mb-2">Questions anticipées</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            L&apos;interface suggère des questions fréquentes et affiche des réponses structurées,
            pour réduire la charge cognitive.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Home;
