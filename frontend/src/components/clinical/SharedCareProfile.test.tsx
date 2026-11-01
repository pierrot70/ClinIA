import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedCareProfile } from "./SharedCareProfile";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../../i18n/homeStrings";
import { UI_LOCALES } from "../../i18n/uiLocales";
import { UI_LABELS_FR } from "../../i18n/uiLabels.fr";
import { clinicalCareAccessLabels } from "../../i18n/clinicalCareAccessLabels";
import { clinicalReviewLabels } from "../../i18n/clinicalReviewLabels";
import { getLocalUiTranslation } from "../../i18n/localUiTranslations";
function View({locale="en-CA",profile}:{locale?:string;profile:Record<string,unknown>}){return <HomeI18nContext.Provider value={{locale,strings:HOME_STRINGS_FR,isTranslating:false,setLocaleFromDropdown:vi.fn(),setLocaleFromVoice:vi.fn()}}><SharedCareProfile profile={profile}/></HomeI18nContext.Provider>;}
afterEach(cleanup);
describe("read-only shared clinical profile",()=>{
 it.each(UI_LOCALES)("uses clinical field labels in %s and preserves authored values without empty fields",locale=>{
  const note=`  Texte original — 原文
Deuxième ligne  `;
  const {container}=render(<View locale={locale} profile={{objective:"Authored fictional objective",age:"72",sex:"",current_medications:"Authored fictional medication",clinicalNotes:note,clinicalScope:"",duration:[],clinicalAnalysisParameters:{}}}/>);
  const text=clinicalCareAccessLabels(locale),review=clinicalReviewLabels(locale);
  expect(screen.getByText(text.profileObjective)).toBeVisible();expect(screen.getByText(review.age)).toBeVisible();expect(screen.getByText(review.medications)).toBeVisible();expect(screen.getByText(text.profileNotes)).toBeVisible();
  expect(screen.queryByText(review.sex)).not.toBeInTheDocument();expect(screen.queryByText(text.profileDuration)).not.toBeInTheDocument();expect(screen.queryByText(text.profileDomain)).not.toBeInTheDocument();expect(screen.queryByText(text.profileParameters)).not.toBeInTheDocument();
  expect(container.querySelectorAll("dt")).toHaveLength(4);
  const values=[...container.querySelectorAll("dd")];expect(values.find(value=>value.textContent===note)).toHaveAttribute("translate","no");expect(values.find(value=>value.textContent===note)).toHaveAttribute("data-content-kind","medical");expect(container.querySelector("pre")).toBeNull();
  expect(container.textContent).not.toContain("clinicalNotes");expect(container.textContent).not.toContain("current_medications");expect(container.textContent).not.toContain('"objective":');
 });
 it("renders recorded clinical parameters as labelled fields and omits technical controls and contact identifiers",()=>{
  const {container}=render(<View profile={{objective:"",num_assurance_maladie:"SYNTHETIC-RAMQ",telephone:"SYNTHETIC-PHONE",courriel:"synthetic@example.test",selected_document_ids:["synthetic-document"],clinicalAnalysisParameters:{age:0,sex:"male",symptoms:["Authored symptom A","","  ","Authored symptom B"],medical_history:["Authored history"],current_medications:[],blood_pressure:{systolic:110,diastolic:70},diabetes_context:{tolerance:"Authored tolerance — 原文",renal_function:""},forceReal:true,openaiModel:"synthetic-model",incidentAckId:"synthetic-incident",num_assurance_maladie:"NESTED-SYNTHETIC-RAMQ"}}}/>);
  const text=clinicalCareAccessLabels("en-CA"),review=clinicalReviewLabels("en-CA");
  expect(screen.getByRole("region",{name:text.profileParameters})).toBeVisible();expect(screen.getByText(review.age)).toBeVisible();expect(screen.getByText("0")).toBeVisible();expect(screen.getByText(text.profileSystolic)).toBeVisible();expect(screen.getByText("110")).toBeVisible();expect(screen.getByText("70")).toBeVisible();
  expect(screen.getByText("Authored symptom A")).toBeVisible();expect(screen.getByText("Authored symptom B")).toBeVisible();expect(screen.getByText(getLocalUiTranslation(UI_LABELS_FR.clinicalFormFields.tolerance,"en-CA")!)).toBeVisible();expect(screen.getByText("Authored tolerance — 原文").closest("dd")).toHaveAttribute("translate","no");
  for(const value of ["SYNTHETIC-RAMQ","NESTED-SYNTHETIC-RAMQ","SYNTHETIC-PHONE","synthetic@example.test","synthetic-document","synthetic-model","synthetic-incident","forceReal","openaiModel","incidentAckId","clinicalAnalysisParameters","blood_pressure","renal_function"]) expect(container.textContent).not.toContain(value);
 });
 it("shows only a local empty notice for empty, malformed or metadata-only fields",()=>{
  const {container}=render(<View profile={{objective:{unexpected:"not a clinical value"},age:Number.NaN,sex:"   ",current_medications:[],clinicalNotes:null,clinicalAnalysisParameters:{age:Infinity,symptoms:[],forceReal:true}}}/>);
  expect(screen.getByText(clinicalCareAccessLabels("en-CA").profileEmpty)).toBeVisible();expect(container.querySelector("dl")).toBeNull();expect(container.querySelector("pre")).toBeNull();
 });
 it("renders authored markup literally without creating active HTML",()=>{const note="<script>synthetic-markup</script>";const {container}=render(<View profile={{clinicalNotes:note}}/>);expect(screen.getByText(note)).toBeVisible();expect(container.querySelector("script")).toBeNull();});
});
