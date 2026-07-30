export function evaluateIndexAuditOutcome({
    result,
    durationMs,
    maxDurationMs,
    strict,
}) {
    const hasDrift = result.errors > 0 || result.extras > 0;

    if (durationMs > maxDurationMs) {
        return {
            status: "WARNING",
            reason: "duration_exceeded",
            hasDrift,
        };
    }

    if (strict && hasDrift) {
        return {
            status: "ERROR",
            reason: "drift_remaining",
            hasDrift,
        };
    }

    return {
        status: hasDrift ? "WARNING" : "OK",
        reason: null,
        hasDrift,
    };
}
