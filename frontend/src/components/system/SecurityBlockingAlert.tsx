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
                    Alerte securite bloquante
                </h2>

                <p id="security-blocking-description" className="mt-3 text-sm text-slate-800">
                    {blocking.userMessage}
                </p>

                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <p>
                        Incident: <span className="font-medium">{blocking.incident.id}</span>
                    </p>
                    <p>
                        Raison: <span className="font-medium">{blocking.incident.reason}</span>
                    </p>
                    <p>
                        Phase: <span className="font-medium">{blocking.incident.phase}</span>
                    </p>
                    <p>
                        Horodatage: <span className="font-medium">{blocking.incident.timestamp}</span>
                    </p>
                </div>

                {actionableMessage && (
                    <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {actionableMessage}
                    </p>
                )}

                <div className="mt-5 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onAcknowledge}
                        disabled={acknowledging}
                        className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        J'ai lu et compris
                    </button>
                    <p className="text-xs text-slate-600">
                        {acknowledging
                            ? "Confirmation en cours..."
                            : "Cette action est obligatoire pour reprendre le workflow."}
                    </p>
                </div>
            </div>
        </div>
    );
}
