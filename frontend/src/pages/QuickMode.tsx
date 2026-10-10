import React from "react";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { getQuickModeHeader, QUICK_MODE_PANEL_EN as panel } from "../i18n/quickModeLabels";
import { hypertensionTreatments } from "../data/hypertension";
import { getExampleUiLabels } from "../i18n/exampleUiLabels";

const QuickMode: React.FC = () => {
  const { locale } = useHomeI18n();
  const header = getQuickModeHeader(locale);
  const ui = getExampleUiLabels(locale);
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

      <section lang={locale} dir={locale.split("-")[0] === "he" ? "rtl" : "ltr"} aria-labelledby="quick-recommendation-title" className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-2">
        <p id="quick-recommendation-title" className="text-xs text-gray-500 uppercase tracking-wide">
          {ui.quickTitle}
        </p>
        <div lang="en" dir="ltr" translate="no" data-testid="quick-clinical-example" className="space-y-2">
        <p className="text-sm text-gray-800">
          1️⃣ <span className="font-semibold">{first.name}</span> – {panel.first}
        </p>
        <p className="text-sm text-gray-800">
          2️⃣ <span className="font-semibold">{second.name}</span> – {panel.second}
        </p>
        <p className="text-sm text-gray-800">
          3️⃣ <span className="font-semibold">{third.name}</span> – {panel.third}
        </p>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {ui.quickDisclaimer}
        </p>
      </section>
    </div>
  );
};

export default QuickMode;
