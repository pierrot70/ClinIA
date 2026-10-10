import { labels } from "../../i18n/uiLabels";
import { UiMessage } from "../i18n/UiMessage";
import { useUiLabels } from "../../hooks/useUiLabels";
import type { SecurityIncidentBlockingData } from "../../types/api";

interface Props {
    blocking: SecurityIncidentBlockingData;
    actionableMessage: string | null;
    acknowledging: boolean;
    onAcknowledge: () => void;
}

export function SecurityBlockingAlert({
    blocking,
    actionableMessage,
    acknowledging,
    onAcknowledge,
}: Props) {
    const { locale: uiLocale, t } = useUiLabels();
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="security-blocking-title"
            aria-describedby="security-blocking-description"
        >
            <div className="w-full max-w-2xl rounded-lg border border-red-300 bg-white p-6 shadow-xl">
                <h2 id="security-blocking-title" className="text-lg font-semibold text-red-700">
                    {t(labels.componentUi.alerteSecuriteBloquante)}</h2>

                <p id="security-blocking-description" className="mt-3 text-sm text-slate-800">
                    <UiMessage message={blocking.userMessage} fallback={labels.componentUi.cetteActionEstObligatoirePourReprendreLeWorkflow} />
                </p>

                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <p>
                        {t(labels.componentUi.incident)} <span className="font-medium">{blocking.incident.id}</span>
                    </p>
                    <p>
                        {t(labels.componentUi.raison)} <span className="font-medium">{blocking.incident.reason}</span>
                    </p>
                    <p>
                        {t(labels.componentUi.phase)} <span className="font-medium">{blocking.incident.phase}</span>
                    </p>
                    <p>
                        {t(labels.componentUi.horodatage)} <span className="font-medium">{Number.isNaN(new Date(blocking.incident.timestamp).getTime()) ? blocking.incident.timestamp : new Date(blocking.incident.timestamp).toLocaleString(uiLocale)}</span>
                    </p>
                </div>

                {actionableMessage && (
                    <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <UiMessage message={actionableMessage} fallback={labels.securityBlocking.acknowledgmentFailed} />
                    </p>
                )}

                <div className="mt-5 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onAcknowledge}
                        disabled={acknowledging}
                        className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {t(labels.componentUi.jAiLuEtCompris)}</button>
                    <p className="text-xs text-slate-600">
                        {acknowledging
                            ? t(labels.componentUi.confirmationEnCours)
                            : t(labels.componentUi.cetteActionEstObligatoirePourReprendreLeWorkflow)}
                    </p>
                </div>
            </div>
        </div>
    );
}
