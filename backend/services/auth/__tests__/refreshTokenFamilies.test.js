import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findOne = vi.fn();
const findOneAndUpdate = vi.fn();
const updateMany = vi.fn();

vi.mock("../../../models/RefreshTokenSession.js", () => ({
    RefreshTokenSession: {
        create,
        findOne,
        findOneAndUpdate,
        updateMany,
    },
    REFRESH_TOKEN_SESSION_STATUS: {
        ACTIVE: "ACTIVE",
        ROTATED: "ROTATED",
        REVOKED: "REVOKED",
        EXPIRED: "EXPIRED",
    },
}));

const {
    createRefreshTokenSession,
    revokeRefreshTokenFamily,
    revokeRefreshTokenFamiliesForUsers,
    rotateActiveRefreshTokenSession,
} = await import("../refreshTokenFamilies.js");

describe("refresh token families", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stores only a token hash with a family identifier", async () => {
        const expiresAt = new Date("2026-07-26T18:00:00.000Z");
        await createRefreshTokenSession({
            userId: "507f1f77bcf86cd799439011",
            familyId: "family-123",
            tokenHash: "a".repeat(64),
            expiresAt,
        });

        expect(create).toHaveBeenCalledWith({
            userId: "507f1f77bcf86cd799439011",
            familyId: "family-123",
            tokenHash: "a".repeat(64),
            expiresAt,
            status: "ACTIVE",
            rotatedAt: null,
        });
    });

    it("rotates only an active, unexpired token", async () => {
        const now = new Date("2026-07-26T10:00:00.000Z");
        await rotateActiveRefreshTokenSession("b".repeat(64), now);

        expect(findOneAndUpdate).toHaveBeenCalledWith(
            {
                tokenHash: "b".repeat(64),
                status: "ACTIVE",
                expiresAt: { $gt: now },
            },
            {
                $set: {
                    status: "ROTATED",
                    rotatedAt: now,
                    lastUsedAt: now,
                },
            },
            { new: true }
        );
    });

    it("revokes every active or rotated token in a compromised family", async () => {
        const now = new Date("2026-07-26T10:00:00.000Z");
        await revokeRefreshTokenFamily("family-123", "REFRESH_TOKEN_REPLAY", now);

        expect(updateMany).toHaveBeenCalledWith(
            {
                familyId: "family-123",
                status: { $in: ["ACTIVE", "ROTATED"] },
            },
            {
                $set: {
                    status: "REVOKED",
                    revokedAt: now,
                    revocationReason: "REFRESH_TOKEN_REPLAY",
                },
            }
        );
    });

    it("revokes active families for a group of users in one query", async () => {
        const now = new Date("2026-07-26T10:00:00.000Z");
        await revokeRefreshTokenFamiliesForUsers(
            ["user-1", "user-2"],
            "SCHEDULED_SHUTDOWN",
            now
        );

        expect(updateMany).toHaveBeenCalledWith(
            {
                userId: { $in: ["user-1", "user-2"] },
                status: { $in: ["ACTIVE", "ROTATED"] },
            },
            {
                $set: {
                    status: "REVOKED",
                    revokedAt: now,
                    revocationReason: "SCHEDULED_SHUTDOWN",
                },
            }
        );
    });
});
