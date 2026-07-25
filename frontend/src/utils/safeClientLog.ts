const SAFE_EVENT_PATTERN = /^[A-Z0-9_.:-]{1,96}$/;

// Browser errors can contain API responses or user input. Keep console output
// limited to a stable event code so a shared workstation does not retain PHI.
export function logSafeClientError(event: string): void {
    const safeEvent = SAFE_EVENT_PATTERN.test(event)
        ? event
        : "UNKNOWN_CLIENT_ERROR";

    console.error("CLINIA_CLIENT_ERROR", { event: safeEvent });
}
