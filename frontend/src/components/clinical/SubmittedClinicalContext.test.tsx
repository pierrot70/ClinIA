import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubmittedClinicalContext } from './SubmittedClinicalContext';
import { clinicalReviewLabels, clinicalReviewTranslations } from '../../i18n/clinicalReviewLabels';
import { UI_LABELS_FR } from '../../i18n/uiLabels.fr';
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
  expect(screen.queryByText('SECRET-ACK')).not.toBeInTheDocument();
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
});
