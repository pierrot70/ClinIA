import crypto from "crypto";
import { CLINICAL_QUERY_WRITE_OPTIONS } from "../../db/clinicalWriteConcern.js";

import { LoginFailureThrottle } from "../../models/LoginFailureThrottle.js";

export const LOGIN_FAILURE_MAX_ATTEMPTS = 5;
export const LOGIN_FAILURE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const LOGIN_FAILURE_DELAYS_MS = [
    60 * 1000,
    5 * 60 * 1000,
    15 * 60 * 1000,
];

function normalizeIp(ip) {
    return typeof ip === "string" && ip.trim() ? ip.trim() : "unknown";
}

export function hashLoginFailureIp(ip) {
    return crypto
        .createHash("sha256")
        .update(normalizeIp(ip))
        .digest("hex");
}

function isBlocked(record, now) {
    if (record?.expiresAt instanceof Date && record.expiresAt <= now) return false;
    return record?.blockedUntil instanceof Date && record.blockedUntil > now;
}

function nextPenaltyLevel(record) {
    return Math.min(
        Number(record?.penaltyLevel || 0) + 1,
        LOGIN_FAILURE_DELAYS_MS.length
    );
}

function toRecordPayload({ userId, ipHash, now, failureCount, penaltyLevel, blockedUntil, lastIncidentPenaltyLevel }) {
    return {
        userId,
        ipHash,
        failureCount,
        penaltyLevel,
        blockedUntil,
        lastIncidentPenaltyLevel,
        expiresAt: new Date(now.getTime() + LOGIN_FAILURE_RETENTION_MS),
    };
}

export async function getLoginFailureThrottle({
    userId,
    ip,
    LoginFailureThrottleModel = LoginFailureThrottle,
    now = new Date(),
}) {
    const ipHash = hashLoginFailureIp(ip);
    const record = await LoginFailureThrottleModel.findOne({ userId, ipHash });

    return {
        blocked: isBlocked(record, now),
        blockedUntil: isBlocked(record, now) ? record.blockedUntil : null,
    };
}

export async function recordLoginFailure({
    userId,
    ip,
    LoginFailureThrottleModel = LoginFailureThrottle,
    now = new Date(),
}) {
    const ipHash = hashLoginFailureIp(ip);
    // Retry only conflicts; a failed database write must never permit login.
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const record = await LoginFailureThrottleModel.findOne({ userId, ipHash });
        // MongoDB TTL deletion is asynchronous. Expired history must not
        // increase a fresh penalty while waiting for that deletion.
        const state = record?.expiresAt instanceof Date && record.expiresAt <= now ? null : record;

        // A blocked source cannot extend its own cooldown just by continuing to send requests.
        if (isBlocked(record, now)) {
            return {
                blocked: true,
                newlyBlocked: false,
                blockedUntil: record.blockedUntil,
                shouldCreateIncident: false,
            };
        }

        const failureCount = Number(state?.failureCount || 0) + 1;
        const reachedLimit = failureCount >= LOGIN_FAILURE_MAX_ATTEMPTS;
        const penaltyLevel = reachedLimit
            ? nextPenaltyLevel(state)
            : Number(state?.penaltyLevel || 0);
        const blockedUntil = reachedLimit
            ? new Date(now.getTime() + LOGIN_FAILURE_DELAYS_MS[penaltyLevel - 1])
            : null;
        const shouldCreateIncident = reachedLimit &&
            penaltyLevel > Number(state?.lastIncidentPenaltyLevel || 0);

        const payload = toRecordPayload({
            userId,
            ipHash,
            now,
            failureCount: reachedLimit ? 0 : failureCount,
            penaltyLevel,
            blockedUntil,
            lastIncidentPenaltyLevel: shouldCreateIncident
                ? penaltyLevel
                : Number(state?.lastIncidentPenaltyLevel || 0),
        });

        if (!record) {
            // The unique user/source index chooses one creator. Other requests
            // must re-read and count their failure, never overwrite the winner.
            try {
                const previous = await LoginFailureThrottleModel.findOneAndUpdate(
                    { userId, ipHash },
                    { $setOnInsert: payload },
                    { ...CLINICAL_QUERY_WRITE_OPTIONS, upsert: true,
                        returnDocument: "before", setDefaultsOnInsert: false },
                );
                if (previous) continue;
            } catch (error) {
                if (error?.code === 11000) continue;
                throw error;
            }
        } else {
            const changed = await LoginFailureThrottleModel.findOneAndUpdate(
                { _id: record._id, userId, ipHash,
                    failureCount: record.failureCount,
                    penaltyLevel: record.penaltyLevel,
                    blockedUntil: record.blockedUntil ?? null,
                    lastIncidentPenaltyLevel: record.lastIncidentPenaltyLevel,
                    expiresAt: record.expiresAt },
                { $set: payload },
                { ...CLINICAL_QUERY_WRITE_OPTIONS, returnDocument: "after" },
            );
            if (!changed) continue;
        }

        return {
            blocked: reachedLimit,
            newlyBlocked: reachedLimit,
            blockedUntil,
            penaltyLevel,
            shouldCreateIncident,
        };
    }
    throw Object.assign(new Error("Login failure counter contention"), {
        code: "LOGIN_FAILURE_THROTTLE_UNAVAILABLE",
    });
}

export async function clearLoginFailureThrottle({
    userId,
    ip,
    LoginFailureThrottleModel = LoginFailureThrottle,
}) {
    await LoginFailureThrottleModel.deleteOne({
        userId,
        ipHash: hashLoginFailureIp(ip),
    });
}
