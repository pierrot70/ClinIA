import { labels } from "../../i18n/uiLabels";
import { useUiLabels } from "../../hooks/useUiLabels";
type Certainty = "low" | "moderate" | "high";

const certaintyStyle: Record<Certainty, string> = {
    high: "bg-green-100 text-green-800",
    moderate: "bg-yellow-100 text-yellow-800",
    low: "bg-red-100 text-red-800",
};

export function DiagnosticHeader({
                                     diagnosis,
                                     certainty,
                                     justification,
                                 }: {
    diagnosis: string;
    certainty: Certainty;
    justification: string;
}) {
    const { locale: uiLocale, t } = useUiLabels();
    return (
        <div className="bg-white border rounded p-5">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-gray-900">
                    {t(labels.componentUi.diagnosticSuspecte)}</h1>
                <span
                    className={`px-3 py-1 text-sm font-medium rounded ${certaintyStyle[certainty]}`}
                >
          {t(labels.componentUi.certitude)} {t(certainty === "high" ? labels.componentUi.elevee : certainty === "moderate" ? labels.componentUi.moderee : labels.componentUi.faible)}
        </span>
            </div>

            <div className="mt-2 text-lg font-medium text-gray-800">
                {diagnosis}
            </div>

            <p className="mt-2 text-sm text-gray-600">
                {justification}
            </p>
        </div>
    );
}
