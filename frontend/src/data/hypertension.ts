import type { Treatment } from "./types";

export const hypertensionTreatments: Treatment[] = [
  {
    id: "indapamide",
    name: "Indapamide",
    shortName: "Indapamide",
    class: "Thiazide-like diuretic",
    efficacy: 0.94,
    sideEffectScore: 25,
    summary:
      "A first-line agent with very good blood pressure control and a generally favorable side effect profile.",
    details:
      "Simulated data: in randomized trials, indapamide shows a significant reduction in blood pressure, with a positive impact on long-term cardiovascular events. Periodic electrolyte monitoring is recommended.",
    flags: ["wellTolerated"]
  },
  {
    id: "amlodipine",
    name: "Amlodipine",
    shortName: "Amlodipine",
    class: "Calcium channel blocker",
    efficacy: 0.89,
    sideEffectScore: 35,
    summary:
      "Well tolerated, particularly useful in patients with stable angina or coronary artery disease.",
    details:
      "Simulated data: amlodipine effectively controls blood pressure. It may cause mild peripheral edema. Useful in older patients or those with cardiac comorbidities.",
    flags: ["wellTolerated"]
  },
  {
    id: "candesartan",
    name: "Candesartan",
    shortName: "Candesartan",
    class: "Angiotensin II receptor blocker (ARB)",
    efficacy: 0.85,
    sideEffectScore: 30,
    summary:
      "A preferred option in diabetes or nephropathy, with a good renal protection profile (simulated data).",
    details:
      "Simulated data: candesartan lowers blood pressure and provides a nephroprotective effect in certain patient profiles. Monitoring of renal function and potassium is recommended.",
    flags: ["monitoring"]
  }
];

export const anticipatedQuestions = [
  {
    question: "What should be done if blood pressure remains high after 4 weeks of treatment?",
    answer:
      "Simulated data: first check adherence, salt intake and home measurements. Increasing the dose or adding a second agent from another class may then be considered."
  },
  {
    question: "Which treatment is preferred in type 2 diabetes?",
    answer:
      "Simulated data: an ARB such as candesartan is often preferred for its renal protection, but this depends on the patient's overall profile and local guidelines."
  },
  {
    question: "What are the main contraindications to watch for?",
    answer:
      "Simulated data: advanced renal impairment, hyperkalemia, symptomatic hypotension and specific drug interactions depending on the selected agent."
  }
];
