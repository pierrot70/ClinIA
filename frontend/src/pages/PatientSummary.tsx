import React from "react";
import { PATIENT_SUMMARY_EXAMPLE_EN as panel, getPatientSummaryHeader } from "../i18n/patientSummaryExample";
import { useHomeI18n } from "../contexts/HomeI18nContext";

const PatientSummary: React.FC = () => {
  const { locale } = useHomeI18n();
  const header = getPatientSummaryHeader(locale);
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

      <section lang="en" dir="ltr" translate="no" aria-labelledby="patient-summary-example-title" className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-sm space-y-3">
        <div>
          <h2 id="patient-summary-example-title" className="text-sm font-semibold text-gray-800 mb-1">
            {panel.title}
          </h2>
          <p className="text-gray-800">
            {panel.summary}
          </p>
        </div>

        <div className="border-t border-dashed border-gray-200 pt-3 space-y-1">
          <p className="text-gray-800">
            {panel.medicationLabel} <span className="font-semibold">{panel.medication}</span>.
          </p>
          <ul className="list-disc ml-4 text-gray-700">
            <li>{panel.instruction}</li>
            <li>{panel.monitoring}</li>
            <li>{panel.followUp}</li>
          </ul>
        </div>

        <p className="text-xs text-gray-500">
          {panel.disclaimer}
        </p>
      </section>
    </div>
  );
};

export default PatientSummary;
