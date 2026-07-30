import crypto from "crypto";

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
    const record = await LoginFailureThrottleModel.findOne({ userId, ipHash });

    // A blocked source cannot extend its own cooldown just by continuing to send requests.
    if (isBlocked(record, now)) {
        return {
            blocked: true,
            newlyBlocked: false,
            blockedUntil: record.blockedUntil,
            shouldCreateIncident: false,
        };
    }

    const failureCount = Number(record?.failureCount || 0) + 1;
    const reachedLimit = failureCount >= LOGIN_FAILURE_MAX_ATTEMPTS;
    const penaltyLevel = reachedLimit
        ? nextPenaltyLevel(record)
        : Number(record?.penaltyLevel || 0);
    const blockedUntil = reachedLimit
        ? new Date(now.getTime() + LOGIN_FAILURE_DELAYS_MS[penaltyLevel - 1])
        : null;
    const shouldCreateIncident = reachedLimit &&
        penaltyLevel > Number(record?.lastIncidentPenaltyLevel || 0);

    const payload = toRecordPayload({
        userId,
        ipHash,
        now,
        failureCount: reachedLimit ? 0 : failureCount,
        penaltyLevel,
        blockedUntil,
        lastIncidentPenaltyLevel: shouldCreateIncident
            ? penaltyLevel
            : Number(record?.lastIncidentPenaltyLevel || 0),
    });

    await LoginFailureThrottleModel.findOneAndUpdate(
        { userId, ipHash },
        { $set: payload },
        { upsert: true, new: true }
    );

    return {
        blocked: reachedLimit,
        newlyBlocked: reachedLimit,
        blockedUntil,
        penaltyLevel,
        shouldCreateIncident,
    };
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
