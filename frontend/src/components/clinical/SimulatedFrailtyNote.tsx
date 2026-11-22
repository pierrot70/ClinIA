import type { ClinicalPayload } from "../../types/clinical";

interface Props {
  context?: ClinicalPayload | null;
  sourceMode?: string;
  option: string;
}

// Clinical reference content is authored in English, like the simulated options.
export function SimulatedFrailtyNote({ context, sourceMode, option }: Props) {
  const frailty = context?.diabetes_context?.fragility?.trim().toLowerCase();
  if (sourceMode !== "mock" || !context || !(context.age >= 65)
      || !["low", "faible"].includes(frailty ?? "")
      || !/^(type 2 diabetes|diabète (de )?type 2)$/i.test(context.diagnosis?.trim() ?? "")) return null;

  let note: string;
  switch (option) {
    case "Metformin":
      if (!context.current_medications?.some(name => /^metformin(e)?$/i.test(name.trim()))) return null;
      note = "With low frailty reported, age alone is not a reason to stop the metformin this patient already takes. Review kidney function, tolerability and the latest measured HbA1c against the patient's individual goal when discussing continuation.";
      break;
    case "Reassessment of a GLP-1 option":
      note = "Low frailty leaves a GLP-1 option open for discussion. Weigh potential cardiovascular and glycemic benefits against gastrointestinal symptoms and unintended weight loss, taking the patient's preferences into account.";
      break;
    default:
      return null;
  }

  return <p lang="en" dir="ltr" translate="no" className="rounded-md border-l-4 border-sky-500 bg-sky-50 p-3 text-sm text-slate-800">{note}</p>;
}
