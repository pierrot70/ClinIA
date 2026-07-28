import crypto from "crypto";

import {
    RefreshTokenSession,
    REFRESH_TOKEN_SESSION_STATUS,
} from "../../models/RefreshTokenSession.js";

export { REFRESH_TOKEN_SESSION_STATUS };

export function createRefreshTokenFamilyId() {
    return crypto.randomUUID();
}

export async function createRefreshTokenSession({
    userId,
    familyId,
    sessionId = null,
    tokenHash,
    expiresAt,
    status = REFRESH_TOKEN_SESSION_STATUS.ACTIVE,
    rotatedAt = null,
}) {
    return RefreshTokenSession.create({
        userId,
        familyId,
        sessionId,
        tokenHash,
        expiresAt,
        status,
        rotatedAt,
    });
}

export async function findRefreshTokenSession(tokenHash) {
    return RefreshTokenSession.findOne({ tokenHash });
}

export async function hasActiveRefreshTokenSessionsForUser(
    userId,
    now = new Date()
) {
    if (!userId) return false;

    const count = await RefreshTokenSession.countDocuments({
        userId,
        status: {
            $in: [
                REFRESH_TOKEN_SESSION_STATUS.ACTIVE,
                REFRESH_TOKEN_SESSION_STATUS.ROTATED,
            ],
        },
        expiresAt: { $gt: now },
    });

    return count > 0;
}

export async function listActiveRefreshTokenSessionsForUser(
    userId,
    now = new Date()
) {
    if (!userId) return [];

    return RefreshTokenSession.find({
        userId,
        status: {
            $in: [
                REFRESH_TOKEN_SESSION_STATUS.ACTIVE,
                REFRESH_TOKEN_SESSION_STATUS.ROTATED,
            ],
        },
        expiresAt: { $gt: now },
    })
        .sort({ createdAt: 1 })
        .select("familyId sessionId createdAt")
        .lean();
}

export async function revokeRefreshTokenSessionForUser(
    userId,
    sessionId,
    reason,
    now = new Date()
) {
    if (!userId || !sessionId) return;

    await RefreshTokenSession.updateMany(
        {
            userId,
            sessionId,
            status: {
                $in: [
                    REFRESH_TOKEN_SESSION_STATUS.ACTIVE,
                    REFRESH_TOKEN_SESSION_STATUS.ROTATED,
                ],
            },
        },
        {
            $set: {
                status: REFRESH_TOKEN_SESSION_STATUS.REVOKED,
                revokedAt: now,
                revocationReason: reason,
            },
        }
    );
}

export async function rotateActiveRefreshTokenSession(tokenHash, now = new Date()) {
    return RefreshTokenSession.findOneAndUpdate(
        {
            tokenHash,
            status: REFRESH_TOKEN_SESSION_STATUS.ACTIVE,
            expiresAt: { $gt: now },
        },
        {
            $set: {
                status: REFRESH_TOKEN_SESSION_STATUS.ROTATED,
                rotatedAt: now,
                lastUsedAt: now,
            },
        },
        { new: true }
    );
}

export async function revokeRefreshTokenFamily(
    familyId,
    reason,
    now = new Date()
) {
    if (!familyId) return;

    await RefreshTokenSession.updateMany(
        {
            familyId,
            status: {
                $in: [
                    REFRESH_TOKEN_SESSION_STATUS.ACTIVE,
                    REFRESH_TOKEN_SESSION_STATUS.ROTATED,
                ],
            },
        },
        {
            $set: {
                status: REFRESH_TOKEN_SESSION_STATUS.REVOKED,
                revokedAt: now,
                revocationReason: reason,
            },
        }
    );
}

export async function revokeRefreshTokenFamiliesForUser(
    userId,
    reason,
    now = new Date()
) {
    if (!userId) return;

    return revokeRefreshTokenFamiliesForUsers([userId], reason, now);
}

export async function revokeRefreshTokenFamiliesForUsers(
    userIds,
    reason,
    now = new Date()
) {
    const validUserIds = Array.isArray(userIds)
        ? userIds.filter(Boolean)
        : [];
    if (validUserIds.length === 0) return;

    await RefreshTokenSession.updateMany(
        {
            userId: { $in: validUserIds },
            status: {
                $in: [
                    REFRESH_TOKEN_SESSION_STATUS.ACTIVE,
                    REFRESH_TOKEN_SESSION_STATUS.ROTATED,
                ],
            },
        },
        {
            $set: {
                status: REFRESH_TOKEN_SESSION_STATUS.REVOKED,
                revokedAt: now,
                revocationReason: reason,
            },
        }
    );
}
