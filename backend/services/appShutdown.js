import { AUTH_ROLES } from "../auth/constants.js";

let shutdownState = {
    isScheduled: false,
    shutdownAt: null,
    activatedAt: null,
    activatedBy: null,
    delaySeconds: null,
};

function assertDelay(delaySeconds) {
    if (
        typeof delaySeconds !== "number" ||
        !Number.isFinite(delaySeconds) ||
        delaySeconds < 5 ||
        delaySeconds > 3600
    ) {
        const err = new Error("Delai d'arret invalide.");
        err.code = "INVALID_INPUT";
        throw err;
    }
}

export function scheduleAppShutdown({ delaySeconds = 30, activatedBy = null }) {
    assertDelay(delaySeconds);

    const now = new Date();
    shutdownState = {
        isScheduled: true,
        shutdownAt: new Date(now.getTime() + delaySeconds * 1000),
        activatedAt: now,
        activatedBy,
        delaySeconds,
    };

    return getAppShutdownState();
}

export function getAppShutdownState() {
    return {
        isScheduled: shutdownState.isScheduled,
        shutdownAt: shutdownState.shutdownAt,
        activatedAt: shutdownState.activatedAt,
        activatedBy: shutdownState.activatedBy,
        delaySeconds: shutdownState.delaySeconds,
    };
}

export function isShutdownEnforcedForRole(role) {
    if (!shutdownState.isScheduled || !shutdownState.shutdownAt) {
        return false;
    }

    if (role === AUTH_ROLES.SUPERADMIN) {
        return false;
    }

    return Date.now() >= shutdownState.shutdownAt.getTime();
}
