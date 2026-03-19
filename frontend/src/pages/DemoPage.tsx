import React from "react";
import { Link } from "react-router-dom";

const demoSteps = [
  {
    minute: "00:00 - 00:45",
    title: "Contexte ClinIA",
    detail:
      "Expliquer que ClinIA assiste le medecin avec des options therapeutiques structurees. ClinIA ne pose pas de diagnostic final et ne prescrit pas.",
  },
  {
    minute: "00:45 - 01:45",
    title: "Connexion et roles",
    detail:
      "Montrer la connexion, puis le controle des roles (MEDECIN, ADMIN, SUPERADMIN) pour les sections sensibles.",
  },
  {
    minute: "01:45 - 03:00",
    title: "Analyse clinique",
    detail:
      "Soumettre un cas de demonstration fictif, afficher hypothese clinique, options therapeutiques, justification et contre-indications.",
  },
  {
    minute: "03:00 - 04:00",
    title: "Trajectoire patient",
    detail:
      "Naviguer vers les pages rendez-vous/patients pour montrer le flux de travail clinique sans exposer de donnees identifiables.",
  },
  {
    minute: "04:00 - 05:00",
    title: "Securite et conformite",
    detail:
      "Conclure avec les garde-fous Loi 25 / PIPEDA: minimisation des donnees, audit logs, controle d'acces et supervision clinique humaine.",
  },
];

const quickChecklist = [
  "Utiliser uniquement des donnees fictives durant la demo.",
  "Eviter toute information patient identifiable dans les prompts IA.",
  "Montrer un message clair: l'IA assiste, le medecin decide.",
  "Terminer avec une invitation aux questions et prochaines etapes.",
];

const DemoPage: React.FC = () => {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">clinique-ai.ca/demo</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Demo ClinIA en moins de 5 minutes</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700 sm:text-base">
          Cette page sert de fil conducteur pour une demonstration courte, claire et orientee valeur clinique.
          L'objectif est de montrer l'utilite de ClinIA sans compromis sur la securite des donnees.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/login"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Commencer la demo
          </Link>
          <Link
            to="/clinical"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            Aller a l'analyse clinique
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {demoSteps.map((step) => (
          <article key={step.minute} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">{step.minute}</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{step.detail}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-emerald-900">Checklist animateur</h2>
        <ul className="mt-3 space-y-2 text-sm text-emerald-900">
          {quickChecklist.map((item) => (
            <li key={item} className="flex items-start gap-2">
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
