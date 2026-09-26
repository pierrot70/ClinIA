import { describe, expect, it } from 'vitest';
import { analysisStatusLabels, analysisStatusTranslations } from './analysisStatusLabels';
import { UI_LABELS_FR } from './uiLabels.fr';
describe('analysis status labels', () => {
 it.each(['fr','en','es','ko','vi','no','ja','zh','he'])('has provider-neutral versioned labels in %s', locale => {
  const t = analysisStatusLabels(locale);
  expect(Object.keys(t)).toEqual(Object.keys(UI_LABELS_FR.analysisStatus));
  expect(Object.values(t).every(v => v.trim())).toBe(true);
  expect(t.inProgress).not.toMatch(/OpenAI|GPT/i);
  expect(analysisStatusLabels(`${locale}-CA`)).toBe(t);
 });
 it('uses the French source and English fallback', () => {
  expect(analysisStatusTranslations.fr).toBe(UI_LABELS_FR.analysisStatus);
  expect(analysisStatusLabels('unknown')).toBe(analysisStatusTranslations.en);
  expect(analysisStatusLabels('en-CA').analyze).toBe('Analyze');
 });
});
