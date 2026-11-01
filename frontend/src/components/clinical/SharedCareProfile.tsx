import { useContext } from "react";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { useUiLabelTree } from "../../hooks/useUiLabels";
import { UI_LABELS_FR } from "../../i18n/uiLabels.fr";
import { clinicalCareAccessLabels } from "../../i18n/clinicalCareAccessLabels";
import { clinicalReviewLabels } from "../../i18n/clinicalReviewLabels";

type Field = { key: string; label: string; values: string[] };
function originalValues(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap(item => typeof item === "string" && item.trim() ? [item]
        : typeof item === "number" && Number.isFinite(item) ? [String(item)] : []);
}
function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function rows(source: Record<string, unknown>, labels: readonly (readonly [string, string])[], prefix = ""): Field[] {
    return labels.map(([key, label]) => ({ key: prefix + key, label, values: originalValues(source[key]) })).filter(field => field.values.length > 0);
}
function FieldList({ fields }: { fields: Field[] }) {
    return <dl className="grid gap-3 sm:grid-cols-2">{fields.map(field => <div key={field.key} className="rounded border bg-white p-3">
        <dt className="text-sm font-semibold text-slate-700">{field.label}</dt>
        <dd className="mt-1 space-y-1 whitespace-pre-wrap text-slate-950" translate="no" data-content-kind="medical">{field.values.map((value, index) => <p key={index}>{value}</p>)}</dd>
    </div>)}</dl>;
}

// Explicit clinical fields only: no recursive object renderer, JSON output,
// contact data, document identifiers or AI/service controls enter this view.
export function SharedCareProfile({ profile }: { profile: Record<string, unknown> }) {
    const { locale } = useContext(HomeI18nContext) || { locale: "fr" };
    const text = clinicalCareAccessLabels(locale);
    const review = clinicalReviewLabels(locale);
    const clinical = useUiLabelTree(UI_LABELS_FR.clinicalFormFields);
    const fields = rows(profile, [
        ["objective", text.profileObjective], ["age", review.age], ["sex", review.sex],
        ["current_medications", review.medications], ["clinicalScope", text.profileDomain],
        ["ageGroup", text.profileAgeGroup], ["symptomProfile", text.profileSymptoms],
        ["cancerType", text.profileCancer], ["duration", text.profileDuration],
        ["severity", text.profileSeverity], ["redFlagStatus", text.profileRedFlags],
        ["comorbidityContext", text.profileComorbidities], ["clinicalNotes", text.profileNotes],
    ]);
    const parameters = object(profile.clinicalAnalysisParameters);
    const parameterFields = [
        ...rows(parameters, [["age", review.age], ["sex", review.sex], ["weight", review.weight], ["height", review.height],
            ["diagnosis", review.diagnosis], ["symptoms", review.symptoms], ["medical_history", review.history],
            ["current_medications", review.medications], ["country", text.profileCountry], ["ethnicity", text.profileEthnicity]]),
        ...rows(object(parameters.blood_pressure), [["systolic", text.profileSystolic], ["diastolic", text.profileDiastolic]], "pressure:"),
        ...rows(object(parameters.diabetes_context), [["cardiovascular_risk", clinical.cardiovascularRisk], ["renal_function", clinical.renalFunction],
            ["fragility", clinical.fragility], ["tolerance", clinical.tolerance], ["glycemic_goals", clinical.glycemicGoals]], "diabetes:"),
    ];
    if (!fields.length && !parameterFields.length) return <p>{text.profileEmpty}</p>;
    return <div className="space-y-4">
        {fields.length > 0 && <FieldList fields={fields} />}
        {parameterFields.length > 0 && <section aria-label={text.profileParameters} className="space-y-3">
            <h4 className="font-semibold">{text.profileParameters}</h4><FieldList fields={parameterFields} />
        </section>}
    </div>;
}
