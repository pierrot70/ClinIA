import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ClinicalDemoResult from "./ClinicalDemoResult";
import TreatmentDetails from "../pages/TreatmentDetails";
import { ClinicalResultReturnProvider } from "../contexts/ClinicalResultReturnContext";
import { getClinicalDemoScenario } from "../data/clinicalDemoScenarios";
// This deliberately crosses the frontend/backend boundary without HTTP, a DB,
// credentials, or provider calls. All outputs below are reconstructed fiction,
// not copied provider records or fresh model generations.
// @ts-ignore JavaScript backend contract is exercised directly by this test.
import { resolveCachedDiagnosisState } from "../../../backend/services/aiAnalyzeCacheService.js";
// @ts-ignore JavaScript backend contract is exercised directly by this test.
import { normalizeClinicalAnalysis, extractPrimaryClinicalConcern, isPlaceholderClinicalAnalysis } from "../../../backend/utils/clinicalAnalysis.js";

beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterAll(() => vi.unstubAllGlobals());

const context={cardiovascular_risk:"Moderate to high",renal_function:"Preserved or mildly reduced",fragility:"Low",tolerance:"Metformin well tolerated",glycemic_goals:"HbA1c < 7% if safe and realistic"};
const cases=[
 {id:"HTA-55",input:{age:55,sex:"male",diagnosis:"Hypertension",symptoms:["Headache","Elevated blood pressure"],medical_history:["Dyslipidemia"],current_medications:["None"]},output:{patient_summary:{plain_language:"Original hypertension summary"},treatments:[{name:"Calcium channel blockers (e.g., amlodipine)",indication:"Pharmacologic treatment"}],other_ai_fields:{monitoring_considerations:{overall:"Original analysis-wide BP follow-up"}}}},
 {id:"DT2-55",input:{age:55,sex:"male",diagnosis:"Type 2 diabetes",symptoms:["Polydipsia","Polyuria","Fatigue"],medical_history:["Hypertension"],current_medications:["Metformin"],diabetes_context:context},output:{patient_summary:{plain_language:"Preserved kidney function and good glycemic control"},treatment_options:{current_strategy:{recommendation:"Original conditional strategy",details:["Actual source details, not static demo"]}}}},
 {id:"DT2-78-LOW-FRAILTY",input:{age:78,sex:"male",diagnosis:"Type 2 diabetes",symptoms:["Polydipsia","Polyuria","Fatigue"],medical_history:["Hypertension"],current_medications:["Metformin"],diabetes_context:context},output:{patient_summary:{plain_language:"Preserved kidney function and good glycemic control"},treatments:[{name:"Actual source option",justification:"Original option rationale",monitoring:["Own monitoring"],contraindications:["Own restriction"]}]}},
 {id:"DT2-CV-58",input:{age:58,sex:"male",diagnosis:"Type 2 diabetes",symptoms:["Persistent hyperglycemia","Progressive weight gain","Fatigue"],medical_history:["Atherosclerotic cardiovascular disease"],current_medications:["Metformin"],diabetes_context:{...context,cardiovascular_risk:"High"}},output:{patient_summary:{plain_language:"You are currently managing it well with metformin"},treatments:[{name:"Actual cardiorenal option",rationale:"Original conditional cardiorenal rationale"}]}},
];
describe("four-case isolated clinical review replay through actual backend safety and frontend rendering",()=>{
 it.each(cases)("$id replays source output without manufacturing a result or clinical assurance", testCase=>{
   const stored=structuredClone(testCase.output);
   const cache=resolveCachedDiagnosisState({cachedDiagnosis:{input:testCase.input,output:stored,mode:"real",model:"isolated-fiction"},model:"isolated-fiction",forceRealSafe:false,useMock:false,normalizeClinicalAnalysis,extractPrimaryClinicalConcern,isPlaceholderClinicalAnalysis});
   expect(cache.canReuseCachedDiagnosis).toBe(true);
   expect(stored).toEqual(testCase.output);
   const result=cache.normalizedCachedOutput;
   const scenario=getClinicalDemoScenario(testCase.input as any);
   render(<MemoryRouter><ClinicalDemoResult sourceMode="real" cacheHit demoData={{...result,summary:result.patient_summary?.plain_language,relevanceByAgeChart:scenario.relevanceByAgeChart}} patientContext={testCase.input as any}/></MemoryRouter>);
   fireEvent.click(screen.getByRole("button",{name:/Résumé clinique du patient/}));
   if(testCase.id.startsWith("DT2")){
     expect(result.summary_safety?.status).toBe("withheld");
     expect(screen.getByRole("status")).toHaveTextContent("contrôle glycémique");
     expect(screen.queryByText(testCase.output.patient_summary.plain_language)).not.toBeInTheDocument();
     expect(screen.getByText("Preserved or mildly reduced")).toBeInTheDocument();
   } else {
     expect(screen.getByText("Original hypertension summary")).toHaveAttribute("translate","no");
   }
   fireEvent.click(screen.getByRole("button",{name:/Alternatives et recommandations/}));
   expect(screen.queryByText(/Simulated data:/)).not.toBeInTheDocument();
   if(testCase.id==="DT2-55"){
     expect(screen.getByText("Original conditional strategy")).toHaveAttribute("translate","no");
     expect(screen.queryByRole("heading",{name:"Metformin"})).not.toBeInTheDocument();
     expect(screen.queryByRole("link",{name:"Détails"})).not.toBeInTheDocument();
   }
   if(testCase.id==="DT2-78-LOW-FRAILTY"){
     fireEvent.click(screen.getByRole("button",{name:/Place clinique relative selon l'âge/}));
     expect(screen.queryByText(/older, frail profile/)).not.toBeInTheDocument();
   }
 });
 it("retains authored scoped information from a named nested option to the treatment detail",()=>{
   const original={name:"Authored nested option",rationale:" Original rationale — sin cambio ",details:"Original details",contraindications:["Own restriction"],monitoring:["Own monitoring"],references:[{name:"Own cited source",url:"https://example.test/reference"}]};
   const result=normalizeClinicalAnalysis({treatment_options:{options:[original],references:[{name:"Global source",url:"https://example.test/global"}]},monitoring_considerations:{global:"Other monitoring"}});
   expect(result.treatments).toHaveLength(1);
   render(<MemoryRouter initialEntries={["/"]}><ClinicalResultReturnProvider><Routes><Route path="/" element={<ClinicalDemoResult sourceMode="real" cacheHit demoData={result} alternativesInitiallyOpen/>}/><Route path="/treatment/:id" element={<TreatmentDetails/>}/></Routes></ClinicalResultReturnProvider></MemoryRouter>);
   fireEvent.click(screen.getByRole("link",{name:"Détails"}));
   expect(screen.getByRole("heading",{name:original.name})).toBeInTheDocument();
   expect(screen.getByText(original.rationale.trim()).textContent).toBe(original.rationale);
   expect(screen.getByText("Original details")).toHaveAttribute("translate","no");
   expect(screen.getByText("Own restriction")).toHaveAttribute("translate","no");
   expect(screen.getByText("Own monitoring")).toHaveAttribute("translate","no");
   expect(screen.getByText(/Own cited source/)).toHaveAttribute("translate","no");
   expect(screen.queryByText("Other monitoring")).not.toBeInTheDocument();
   expect(screen.getByText("Réponse réutilisée depuis le cache.")).toBeInTheDocument();
 });
});
