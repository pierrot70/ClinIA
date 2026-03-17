import { AUTH_ROLES } from "../auth/constants.js";
import { AdminUser } from "../models/AdminUser.js";

let shutdownState = {
    isScheduled: false,
    shutdownAt: null,
    activatedAt: null,
    activatedBy: null,
    delaySeconds: null,
    enforcedAt: null,
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
        enforcedAt: null,
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
        enforcedAt: shutdownState.enforcedAt,
    };
}

export function isMaintenanceActive() {
    return Boolean(
        shutdownState.isScheduled &&
        shutdownState.shutdownAt &&
        Date.now() >= shutdownState.shutdownAt.getTime()
    );
}

export async function enforceScheduledShutdownIfDue() {
    if (
        !shutdownState.isScheduled ||
        !shutdownState.shutdownAt ||
        shutdownState.enforcedAt ||
        Date.now() < shutdownState.shutdownAt.getTime()
    ) {
        return false;
    }

    await AdminUser.updateMany(
        {
            role: { $ne: AUTH_ROLES.SUPERADMIN },
            refreshTokenHash: { $ne: null },
        },
        {
            $set: {
                refreshTokenHash: null,
                refreshTokenExpiresAt: null,
                lastLogoutAt: new Date(),
            },
        }
    );

    shutdownState.enforcedAt = new Date();
    return true;
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
