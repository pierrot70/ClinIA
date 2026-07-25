import type { ClinicalPayload } from "../../types/clinical";
import type { SecurityIncidentBlockingData } from "../../types/api";

type Preview = NonNullable<
    SecurityIncidentBlockingData["incident"]["sanitizationPreview"]
>;

type Props = {
    originalPayload: ClinicalPayload;
    preview: Preview;
    labels: {
        title: string;
        description: string;
        original: string;
        corrected: string;
        empty: string;
        continue: string;
        cancel: string;
        fields: Record<string, string>;
    };
    onContinue: () => void;
    onCancel: () => void;
};

function formatValue(value: unknown, emptyLabel: string) {
    if (Array.isArray(value)) {
        return value.length > 0 ? value.join(", ") : emptyLabel;
    }

    return typeof value === "string" && value.trim() ? value : emptyLabel;
}

export function SecurityNeutralizationReview({
    originalPayload,
    preview,
    labels,
    onContinue,
    onCancel,
}: Props) {
    const fields = Object.keys(preview).filter(
        (field) => field in originalPayload
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="security-neutralization-title"
        >
            <section className="w-full max-w-2xl rounded-lg border border-amber-300 bg-white p-6 shadow-xl">
                <h2
                    id="security-neutralization-title"
                    className="text-lg font-semibold text-amber-900"
                >
                    {labels.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-800">
                    {labels.description}
                </p>

                <dl className="mt-5 space-y-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm">
                    {fields.map((field) => (
                        <div key={field}>
                            <dt className="font-semibold text-slate-900">
                                {labels.fields[field] || field}
                            </dt>
                            <dd className="mt-1">
                                <span className="font-medium">{labels.original}: </span>
                                {formatValue(
                                    originalPayload[field as keyof ClinicalPayload],
                                    labels.empty
                                )}
                            </dd>
                            <dd className="mt-1 text-emerald-800">
                                <span className="font-medium">{labels.corrected}: </span>
                                {formatValue(
                                    preview[field as keyof Preview],
                                    labels.empty
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>

                <div className="mt-5 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={onContinue}
                        className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                        {labels.continue}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                    >
                        {labels.cancel}
                    </button>
                </div>
            </section>
        </div>
    );
}
