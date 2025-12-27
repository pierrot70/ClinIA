import type { ApiError } from "../../types/api";

interface Props {
    error: ApiError;
    onRetry?: () => void;
}

export function ServiceStatusBanner({ error, onRetry }: Props) {
    const isDegraded = error.code === "AI_DEGRADED";
    const isUnavailable = error.code === "AI_UNAVAILABLE";

    return (
        <div
            className={`border rounded p-4 text-sm ${
                isUnavailable
                    ? "bg-red-50 border-red-300 text-red-800"
                    : "bg-amber-50 border-amber-300 text-amber-800"
            }`}
        >
            <p className="font-medium mb-1">
                {isUnavailable
                    ? "Service temporairement indisponible"
                    : "Service en mode dégradé"}
            </p>

            <p className="mb-2">{error.message}</p>

            {error.retryable && onRetry && (
                <button
                    onClick={onRetry}
                    className="text-xs underline font-medium"
                >
                    Réessayer maintenant
                </button>
            )}
        </div>
    );
}
