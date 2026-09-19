import { useContext } from "react";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { clinicalSafetyLabels } from "../../i18n/clinicalSafetyLabels";

export function ClinicalSafetySections({ alternatives, redFlags, targetLang }: {
    alternatives?: unknown;
    redFlags?: unknown;
    targetLang?: string;
}) {
    const i18n = useContext(HomeI18nContext);
    const labels = clinicalSafetyLabels(targetLang || i18n?.locale || "fr");
    // Older cached responses may omit lists or contain malformed entries.
    const options = Array.isArray(alternatives) ? alternatives.filter(
        (value): value is { name: string; reason?: string } =>
            value !== null && typeof value === "object" && typeof value.name === "string" && Boolean(value.name.trim()),
    ) : [];
    const flags = Array.isArray(redFlags) ? redFlags.filter(
        (value): value is string => typeof value === "string" && Boolean(value.trim()),
    ) : [];

    return <>
        {flags.length > 0 && <section aria-label={labels.redFlags} className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
            <h2 className="text-lg font-semibold">{labels.redFlags}</h2>
            <ul className="mt-2 list-disc pl-5">{flags.map((flag, index) => <li key={index}>{flag}</li>)}</ul>
        </section>}
        {options.length > 0 && <section aria-label={labels.alternatives} className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-semibold">{labels.alternatives}</h2>
            <ul className="mt-2 space-y-3">{options.map((option, index) => <li key={index}>
                <h3 className="font-medium">{option.name}</h3>
                {typeof option.reason === "string" && option.reason.trim() && <p className="text-sm text-gray-700">{option.reason}</p>}
            </li>)}</ul>
        </section>}
    </>;
}
