import type { ClinicalPayload } from "../../types/clinical";

interface Props {
  context?: ClinicalPayload | null;
  sourceMode?: string;
  option: string;
}

// Clinical reference content is authored in English, like the simulated options.
export function SimulatedDiabetesOptionNote({ context, sourceMode, option }: Props) {
  if (sourceMode !== "mock" || !context
      || !/^(type 2 diabetes|diabète (de )?type 2)$/i.test(context.diagnosis?.trim() ?? "")) return null;

  const lowFrailty = context.age >= 65
    && ["low", "faible"].includes(context.diabetes_context?.fragility?.trim().toLowerCase() ?? "");
  // Match a documented condition, excluding negated, suspected and family history entries.
  const establishedASCVD = context.medical_history?.some(entry =>
    /^(atherosclerotic cardiovascular disease|maladie cardiovasculaire athéroscléreuse|ascvd)$/i.test(entry.trim())
  );
  const notes: string[] = [];
  switch (option) {
    case "Metformin":
      if (!context.current_medications?.some(name => /^metformin(e)?$/i.test(name.trim()))) return null;
      if (establishedASCVD) notes.push("This patient already takes metformin for glucose control. Review kidney function and tolerability when discussing continuation. Documented atherosclerotic cardiovascular disease also calls for a discussion of therapies that reduce future cardiovascular events, even if the HbA1c goal is met.");
      if (lowFrailty) notes.push("With low frailty reported, age alone is not a reason to stop the metformin this patient already takes. Review kidney function, tolerability and the latest measured HbA1c against the patient's individual goal when discussing continuation.");
      break;
    case "Reassessment of a GLP-1 option":
      if (establishedASCVD) notes.push("With documented atherosclerotic cardiovascular disease, a GLP-1 receptor agonist with proven cardiovascular benefit is an option to reduce future cardiovascular events. This benefit is relevant even when HbA1c is at goal. Discuss gastrointestinal effects and the patient's preferences.");
      if (lowFrailty) notes.push("Low frailty leaves a GLP-1 option open for discussion. Weigh potential cardiovascular and glycemic benefits against gastrointestinal symptoms and unintended weight loss, taking the patient's preferences into account.");
      break;
    default:
      return null;
  }

  return <>{notes.map(note => <p key={note} lang="en" dir="ltr" translate="no" className="rounded-md border-l-4 border-sky-500 bg-sky-50 p-3 text-sm text-slate-800">{note}</p>)}</>;
}
