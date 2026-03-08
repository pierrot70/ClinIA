import React from "react";
import SearchBar from "../components/SearchBar";
import { useHomeI18n } from "../contexts/HomeI18nContext";

const Home: React.FC = () => {
  const { strings, isTranslating, locale } = useHomeI18n();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10 flex flex-col items-center gap-8 sm:gap-10">
      <section className="relative w-full overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="absolute -top-24 -left-24 h-56 w-56 rounded-full bg-sky-100 blur-3xl opacity-60" />
        <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-indigo-100 blur-3xl opacity-60" />

        <div className="relative px-6 py-10 sm:px-10 sm:py-14 text-center max-w-3xl mx-auto space-y-5">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            {strings.home.title}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
            {strings.home.subtitle}
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 inline-block px-3 py-1 rounded-full">
            {strings.home.disclaimer}
          </p>
          {isTranslating && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 inline-block px-3 py-1 rounded-full">
              {locale.toLowerCase().startsWith("en")
                ? "Translating interface..."
                : "Traduction de l'interface..."}
            </p>
          )}

          <div className="pt-1 sm:pt-2">
            <SearchBar />
          </div>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-4 w-full">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="font-semibold text-sm mb-2">{strings.home.cardReadTitle}</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            {strings.home.cardReadBody}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="font-semibold text-sm mb-2">{strings.home.cardChartsTitle}</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            {strings.home.cardChartsBody}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="font-semibold text-sm mb-2">{strings.home.cardQuestionsTitle}</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            {strings.home.cardQuestionsBody}
          </p>
        </div>
      </section>
    </div>
  );
};

export default Home;
