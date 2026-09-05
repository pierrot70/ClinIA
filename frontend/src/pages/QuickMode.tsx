import React from "react";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { getQuickModeHeader, QUICK_MODE_PANEL_EN as panel } from "../i18n/quickModeLabels";
import { hypertensionTreatments } from "../data/hypertension";

const QuickMode: React.FC = () => {
  const { locale } = useHomeI18n();
  const header = getQuickModeHeader(locale);
  const [first, second, third] = hypertensionTreatments;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <header lang={locale} dir={locale.split("-")[0] === "he" ? "rtl" : "ltr"} className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">
          {header.title}
        </h1>
        <p className="text-sm text-gray-600">
          {header.description}
        </p>
      </header>

      <section lang="en" dir="ltr" translate="no" aria-labelledby="quick-recommendation-title" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <p id="quick-recommendation-title" className="text-xs text-gray-500 uppercase tracking-wide">
          {panel.title}
        </p>
        <p className="text-sm text-gray-800">
          1️⃣ <span className="font-semibold">{first.name}</span> – {panel.first}
        </p>
        <p className="text-sm text-gray-800">
          2️⃣ <span className="font-semibold">{second.name}</span> – {panel.second}
        </p>
        <p className="text-sm text-gray-800">
          3️⃣ <span className="font-semibold">{third.name}</span> – {panel.third}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          {panel.disclaimer}
        </p>
      </section>
    </div>
  );
};

export default QuickMode;
