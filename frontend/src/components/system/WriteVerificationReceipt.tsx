import type { WriteVerificationMeta } from "../../types/api";

type WriteVerificationReceiptProps = {
    verification?: WriteVerificationMeta | null;
    labels: {
        title: string;
        unavailable: string;
        copy: string;
    };
};

export function formatWriteVerificationMessage(
    baseMessage: string,
    verification?: WriteVerificationMeta | null
) {
    if (verification?.status !== "CONFIRMED" || !verification.verificationId) {
        return baseMessage;
    }

    return `${baseMessage} No verification: ${verification.verificationId}`;
}

export function WriteVerificationReceipt({
    verification,
    labels,
}: WriteVerificationReceiptProps) {
    const isConfirmed =
        verification?.status === "CONFIRMED" && Boolean(verification.verificationId);
    const textToCopy = verification?.verificationId || "";

    async function copyReceipt() {
        if (!textToCopy) return;

        try {
            await navigator.clipboard?.writeText(textToCopy);
        } catch {
            // The visible id remains available if clipboard access is denied.
        }
    }

    if (!verification) {
        return null;
    }

    return (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span className="font-semibold">{labels.title}</span>
            {isConfirmed ? (
                <>
                    <code className="rounded bg-white px-2 py-1 font-mono text-[11px] text-emerald-950">
                        {verification.verificationId}
                    </code>
                    <button
                        type="button"
                        onClick={copyReceipt}
                        className="rounded border border-emerald-300 bg-white px-2 py-1 font-medium text-emerald-900 hover:bg-emerald-100"
                    >
                        {labels.copy}
                    </button>
                </>
            ) : (
                <span>{labels.unavailable}</span>
            )}
        </div>
    );
}
