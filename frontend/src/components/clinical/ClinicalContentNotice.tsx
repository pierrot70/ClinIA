import { useUiLabels } from "../../hooks/useUiLabels";
import { labels } from "../../i18n/uiLabels";

export function ClinicalContentNotice() {
    const { t } = useUiLabels();
    return <p className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
        {t(labels.residualClinicalUi.englishSourceNotice)}
    </p>;
}
