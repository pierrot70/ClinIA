import { labels } from "../i18n/uiLabels";
import { useUiLabels } from "../hooks/useUiLabels";
type Props = {
    loading: boolean;
    error: boolean;
    text?: string;
};

export default function AICard({ loading, error, text }: Props) {
    const { locale: uiLocale, t } = useUiLabels();
    if (loading) {
        return (
            <p role="status" className="py-4 text-center text-sm text-gray-700">
                {t(labels.pageUi.loading)}
            </p>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                {text || t(labels.componentUi.uneErreurEstSurvenueLorsDeLAnalyse)}
            </div>
        );
    }

    if (!text) {
        return null;
    }

    return (
        <div dir="auto" translate="no" className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-800">
            {text}
        </div>
    );
}
