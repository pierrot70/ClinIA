import { AUTH_ROLES } from "../auth/constants.js";
import { AdminUser } from "../models/AdminUser.js";
import { AppSettings } from "../models/AppSettings.js";

const SETTINGS_KEY = "main";

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

function applyDocToState(doc) {
    shutdownState = {
        isScheduled: Boolean(doc.maintenanceIsScheduled),
        shutdownAt: doc.maintenanceShutdownAt ?? null,
        activatedAt: doc.maintenanceActivatedAt ?? null,
        activatedBy: doc.maintenanceActivatedBy ?? null,
        delaySeconds: doc.maintenanceDelaySeconds ?? null,
        enforcedAt: doc.maintenanceEnforcedAt ?? null,
    };
}

async function persistState(fields) {
    await AppSettings.findOneAndUpdate(
        { key: SETTINGS_KEY },
        { $set: { key: SETTINGS_KEY, ...fields } },
        { upsert: true, new: true }
    );
}

/**
 * Called once at backend startup to hydrate in-memory state from MongoDB.
 * This ensures the maintenance state survives restarts and is shared
 * between the Coolify remote instance and any other deployment.
 */
export async function initShutdownState() {
    try {
        const doc = await AppSettings.findOne({ key: SETTINGS_KEY });
        if (doc) {
            applyDocToState(doc);
        }
    } catch (err) {
        console.error("[appShutdown] Failed to load state from DB:", err.message);
    }
}

export async function scheduleAppShutdown({ delaySeconds = 30, activatedBy = null }) {
    assertDelay(delaySeconds);

    const now = new Date();
    const nextState = {
        isScheduled: true,
        shutdownAt: new Date(now.getTime() + delaySeconds * 1000),
        activatedAt: now,
        activatedBy,
        delaySeconds,
        enforcedAt: null,
    };

    shutdownState = nextState;

    await persistState({
        maintenanceIsScheduled: true,
        maintenanceShutdownAt: nextState.shutdownAt,
        maintenanceActivatedAt: nextState.activatedAt,
        maintenanceActivatedBy: nextState.activatedBy,
        maintenanceDelaySeconds: nextState.delaySeconds,
        maintenanceEnforcedAt: null,
    });

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

    await persistState({ maintenanceEnforcedAt: shutdownState.enforcedAt });

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

/**
 * Clears the maintenance state (called by SUPERADMIN to end maintenance).
 */
export async function clearMaintenanceState() {
    shutdownState = {
        isScheduled: false,
        shutdownAt: null,
        activatedAt: null,
        activatedBy: null,
        delaySeconds: null,
        enforcedAt: null,
    };

    await persistState({
        maintenanceIsScheduled: false,
        maintenanceShutdownAt: null,
        maintenanceActivatedAt: null,
        maintenanceActivatedBy: null,
        maintenanceDelaySeconds: null,
        maintenanceEnforcedAt: null,
    });
}
