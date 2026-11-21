import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUiLabelTree } from "../../hooks/useUiLabels";
import { UI_LABELS_FR } from "../../i18n/uiLabels.fr";
import { getGeneralTransferNotice } from "../../services/clinicalCareAccessApi";

export function GeneralTransferNotice() {
    const text = useUiLabelTree(UI_LABELS_FR.patientCareTransfer);
    const [notice, setNotice] = useState<"overdueBanner" | "incomingGeneralBanner" | null>(null);

    useEffect(() => {
        let active = true;
        let loading = false;
        let timer: number;
        async function refresh() {
            if (document.hidden || loading) return;
            loading = true;
            const result = await getGeneralTransferNotice();
            loading = false;
            if (!active || !("data" in result)) return;
            window.clearTimeout(timer);
            const { overdueCount, nextReminderAt, incomingGeneral } = result.data;
            setNotice(overdueCount > 0 ? "overdueBanner" : incomingGeneral ? "incomingGeneralBanner" : null);
            if (nextReminderAt) {
                const delay = Date.parse(nextReminderAt) - Date.now();
                if (Number.isFinite(delay)) timer = window.setTimeout(refresh, Math.max(1000, delay));
            }
        }
        void refresh();
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => {
            active = false;
            window.clearTimeout(timer);
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, []);

    if (!notice) return null;
    return <aside role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {text[notice]}{" "}<Link to="/clinical-care-transfer" className="font-semibold underline">{text.title}</Link>
    </aside>;
}
