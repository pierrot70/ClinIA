import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubmittedClinicalContext } from './SubmittedClinicalContext';
import { clinicalReviewLabels, clinicalReviewTranslations } from '../../i18n/clinicalReviewLabels';
import { UI_LABELS_FR } from '../../i18n/uiLabels.fr';
import { localizeClinicalFormFieldLabel } from '../../i18n/clinicalFormFieldLabels';
import ClinicalDemoResult from '../ClinicalDemoResult';
import { HomeI18nContext } from '../../contexts/HomeI18nContext';
import type { ClinicalPayload } from '../../types/clinical';
const context: ClinicalPayload = {age:55,sex:'male',diagnosis:'Hypertension',weight:92,height:175,symptoms:['Headache'],medical_history:['Dyslipidemia'],current_medications:[],incidentAckId:'SECRET-ACK'};

describe('submitted analysis context', () => {
 it.each(Object.keys(clinicalReviewTranslations))('updates UI labels in %s without translating clinical values', locale => {
  const {rerender} = render(<SubmittedClinicalContext context={context} locale="fr" />);
  rerender(<SubmittedClinicalContext context={context} locale={locale} />);
  const t=clinicalReviewLabels(locale);
  expect(Object.keys(t)).toEqual(Object.keys(UI_LABELS_FR.clinicalReview));
  expect(Object.values(t).every(v => v.trim())).toBe(true);
  expect(screen.getByRole('region',{name:t.submitted})).toBeVisible();
  for(const value of ['55','92','175','Hypertension','Headache','Dyslipidemia',t.male,t.missing]) expect(screen.getByText(value)).toBeVisible();
  expect(screen.getByText(t.age)).toBeVisible();
  for (const value of ['55','92','175','Hypertension','Headache','Dyslipidemia']) {
   expect(screen.getByText(value)).toHaveAttribute('translate', 'no');
  }
  for (const value of [t.male,t.missing]) {
   expect(screen.getByText(value).closest('[translate="no"]')).toBeNull();
  }
  expect(screen.queryByText('SECRET-ACK')).not.toBeInTheDocument();
 });
 it('protects authored source text even when it equals the missing UI label', () => {
  const t = clinicalReviewLabels('en');
  render(<SubmittedClinicalContext context={{...context,diagnosis:t.missing}} locale="en" />);
  const diagnosis = screen.getByText(t.diagnosis).closest('div')!.querySelector('dd')!;
  const medications = screen.getByText(t.medications).closest('div')!.querySelector('dd')!;
  expect(diagnosis).toHaveTextContent(t.missing);
  expect(diagnosis).toHaveAttribute('translate','no');
  expect(medications).toHaveTextContent(t.missing);
  expect(medications.closest('[translate="no"]')).toBeNull();
 });
 it('does not invent missing measurements or show a missing age as zero', () => {
  render(<SubmittedClinicalContext context={{...context,age:0,weight:undefined,height:undefined}} locale="en-CA" />);
  expect(screen.getByText('0')).toBeVisible();
  expect(screen.getAllByText('Not provided')).toHaveLength(3);
  expect(clinicalReviewLabels('unknown')).toEqual(clinicalReviewLabels('en'));
 });
 it.each([{}, {clinical_summary:'Existing result'}, {error:'Unavailable'}])('shows submitted values even without generated patient summary: %j', demoData => {
  const copy=vi.fn();
  render(<HomeI18nContext.Provider value={{locale:'en-CA'} as any}><ClinicalDemoResult demoData={demoData} patientContext={context} canCopyRequest onCopyRequest={copy} /></HomeI18nContext.Provider>);
  const button=screen.getByRole('button',{name:/Patient clinical summary/});
  if(button.getAttribute('aria-expanded')==='false') fireEvent.click(button);
  expect(screen.getByText('55')).toBeVisible();
  expect(screen.getByText('92')).toBeVisible();
  expect(screen.getByText('175')).toBeVisible();
  // The advanced result layout historically has no export action.
  if(!('clinical_summary' in demoData)) {fireEvent.click(screen.getByRole('button',{name:'Copy request JSON'}));expect(copy).toHaveBeenCalledOnce();}
 });
 it.each(Object.keys(clinicalReviewTranslations))('preserves submitted diabetes uncertainties and labels in %s without exposing extra fields', locale => {
  const values = {
   cardiovascular_risk: 'Moderate to high', renal_function: 'Preserved or mildly reduced',
   fragility: 'Low', tolerance: 'Metformin well tolerated', glycemic_goals: 'HbA1c < 7% if safe and realistic',
  };
  render(<SubmittedClinicalContext locale={locale} context={{...context, diagnosis:'Type 2 diabetes',
   diabetes_context:{...values, unauthorized:'DO-NOT-EXPOSE'} as any}} />);
  for(const value of Object.values(values)) {
   const element=screen.getByText(value);
   expect(element).toBeVisible();
   expect(element).toHaveAttribute('translate','no');
   expect(element).toHaveAttribute('dir','auto');
  }
  const f=UI_LABELS_FR.clinicalFormFields;
  for(const source of [f.cardiovascularRisk,f.renalFunction,f.fragility,f.tolerance,f.glycemicGoals])
   expect(screen.getByText(localizeClinicalFormFieldLabel(source,locale) ?? source)).toBeVisible();
  expect(screen.queryByText('DO-NOT-EXPOSE')).not.toBeInTheDocument();
  expect(screen.queryByText('SECRET-ACK')).not.toBeInTheDocument();
 });

});
