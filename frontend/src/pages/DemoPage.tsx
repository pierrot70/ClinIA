

import React from "react";
import { Link } from "react-router-dom";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { useTranslation } from "../hooks/useTranslation";

// Source strings (EN)
const DEMO_STRINGS = {
  pageTitle: "ClinIA Demo in under 5 minutes",
  pageSubtitle:
    "This page is a guide for a short, clear, value-oriented demo. The goal is to show ClinIA's utility without compromising data security.",
  startDemo: "Start the demo",
  goToClinical: "Go to clinical analysis",
  presenterChecklist: "Presenter checklist",
  steps: [
    {
      minute: "00:00 - 00:45",
      title: "ClinIA Context",
      detail:
        "Explain that ClinIA assists the physician with structured therapeutic options. ClinIA does not make a final diagnosis and does not prescribe.",
    },
    {
      minute: "00:45 - 01:45",
      title: "Login and roles",
      detail:
        "Show login, then role control (MEDECIN, ADMIN, SUPERADMIN) for sensitive sections.",
    },
    {
      minute: "01:45 - 03:00",
      title: "Clinical analysis",
      detail:
        "Submit a fictitious demo case, display clinical hypothesis, therapeutic options, justification, and contraindications.",
    },
    {
      minute: "03:00 - 04:00",
      title: "Patient journey",
      detail:
        "Navigate to appointments/patients pages to show the clinical workflow without exposing identifiable data.",
    },
    {
      minute: "04:00 - 05:00",
      title: "Security and compliance",
      detail:
        "Conclude with Loi 25 / PIPEDA safeguards: data minimization, audit logs, access control, and human clinical supervision.",
    },
  ],
  checklist: [
    "Use only fictitious data during the demo.",
    "Avoid any patient-identifiable information in AI prompts.",
    "Show a clear message: AI assists, the physician decides.",
    "End with an invitation for questions and next steps.",
  ],
};

const DemoPage: React.FC = () => {
  const { locale } = useHomeI18n();
  // Traductions dynamiques pour chaque champ
  const { translated: pageTitle } = useTranslation({ text: DEMO_STRINGS.pageTitle, targetLang: locale });
  const { translated: pageSubtitle } = useTranslation({ text: DEMO_STRINGS.pageSubtitle, targetLang: locale });
  const { translated: startDemo } = useTranslation({ text: DEMO_STRINGS.startDemo, targetLang: locale });
  const { translated: goToClinical } = useTranslation({ text: DEMO_STRINGS.goToClinical, targetLang: locale });
  const { translated: presenterChecklist } = useTranslation({ text: DEMO_STRINGS.presenterChecklist, targetLang: locale });

  // Traduction dynamique pour chaque étape
  const steps = DEMO_STRINGS.steps.map((step) => {
    const { translated: title } = useTranslation({ text: step.title, targetLang: locale });
    const { translated: detail } = useTranslation({ text: step.detail, targetLang: locale });
    return { ...step, title, detail };
  });

  // Traduction dynamique pour chaque item de checklist
  const checklist = DEMO_STRINGS.checklist.map((item) => {
    const { translated } = useTranslation({ text: item, targetLang: locale });
    return translated;
  });

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">clinique-ai.ca/demo</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {pageTitle}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700 sm:text-base">
          {pageSubtitle}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/login"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {startDemo}
          </Link>
          <Link
            to="/clinical-demo"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            {goToClinical}
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <article key={step.minute} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">{step.minute}</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{step.detail}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-emerald-900">
          {presenterChecklist}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-emerald-900">
          {checklist.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-700" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default DemoPage;
