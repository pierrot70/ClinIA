import type { ClinicalPayload } from '../../types/clinical';
import { clinicalReviewLabels } from '../../i18n/clinicalReviewLabels';

// Show the submitted values, never infer patient details from generated prose.
// The allowlist also excludes ephemeral authorization/control fields.
export function SubmittedClinicalContext({ context, locale }: { context?: ClinicalPayload | null; locale: string }) {
 if (!context) return null;
 const t = clinicalReviewLabels(locale);
 const display = (value: unknown) => {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string' && v.trim()).join(', ') || null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  return typeof value === 'string' && value.trim() ? value : null;
 };
 const rows = [
  [t.age, context.age, false], [t.sex, context.sex ? t[context.sex] : undefined, true],
  [t.diagnosis, context.diagnosis, false], [t.weight, context.weight, false], [t.height, context.height, false],
  [t.symptoms, context.symptoms, false], [t.history, context.medical_history, false], [t.medications, context.current_medications, false],
 ] as const;
 return <section aria-label={t.submitted} className="mb-4 rounded border border-slate-200 bg-slate-50 p-3" data-content-kind="ui">
  <h3 className="mb-2 font-semibold">{t.submitted}</h3>
  <dl className="grid gap-3 sm:grid-cols-2">{rows.map(([label, value, uiValue]) => {
   const text = display(value);
   const clinicalValue = !uiValue && text !== null;
   return <div key={label}>
    <dt className="text-sm text-slate-600">{label}</dt>
    <dd className="break-words text-sm font-medium" translate={clinicalValue ? "no" : undefined} dir={clinicalValue ? "auto" : undefined}>{text ?? t.missing}</dd>
   </div>;
  })}</dl>
 </section>;
}
