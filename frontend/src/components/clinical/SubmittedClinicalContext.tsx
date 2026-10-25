import type { ClinicalPayload } from '../../types/clinical';
import { clinicalReviewLabels } from '../../i18n/clinicalReviewLabels';
import { UI_LABELS_FR } from '../../i18n/uiLabels.fr';
import { localizeClinicalFormFieldLabel } from '../../i18n/clinicalFormFieldLabels';

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
 const f = UI_LABELS_FR.clinicalFormFields;
 const fieldLabel = (source: string) => localizeClinicalFormFieldLabel(source, locale) ?? source;
 const diabetesRows: readonly (readonly [string, unknown, boolean])[] = context.diabetes_context ? [
  [fieldLabel(f.cardiovascularRisk), context.diabetes_context.cardiovascular_risk, false],
  [fieldLabel(f.renalFunction), context.diabetes_context.renal_function, false],
  [fieldLabel(f.fragility), context.diabetes_context.fragility, false],
  [fieldLabel(f.tolerance), context.diabetes_context.tolerance, false],
  [fieldLabel(f.glycemicGoals), context.diabetes_context.glycemic_goals, false],
 ] : [];
 const rows: readonly (readonly [string, unknown, boolean])[] = [
  [t.age, context.age, false], [t.sex, context.sex ? t[context.sex] : undefined, true],
  [t.diagnosis, context.diagnosis, false], [t.weight, context.weight, false], [t.height, context.height, false],
  [t.symptoms, context.symptoms, false], [t.history, context.medical_history, false], [t.medications, context.current_medications, false],
  ...diabetesRows,
 ];
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
