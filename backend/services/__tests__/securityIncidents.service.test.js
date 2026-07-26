import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findById = vi.fn();
const findOneAndUpdate = vi.fn();
const findOneLean = vi.fn();
const findOne = vi.fn(() => ({ lean: findOneLean }));
const countDocuments = vi.fn();
const lean = vi.fn();
const limit = vi.fn(() => ({ lean }));
const skip = vi.fn(() => ({ limit }));
const sort = vi.fn(() => ({ skip }));
const find = vi.fn(() => ({ sort }));
const findAdminUserById = vi.fn();
const revokeRefreshTokenFamiliesForUser = vi.fn();

vi.mock("../../models/SecurityIncident.js", () => ({
    SecurityIncident: {
        create,
        countDocuments,
        find,
        findById,
        findOne,
        findOneAndUpdate,
    },
}));

vi.mock("../../models/AdminUser.js", () => ({
    AdminUser: {
        findById: findAdminUserById,
    },
}));

vi.mock("../auth/refreshTokenFamilies.js", () => ({
    revokeRefreshTokenFamiliesForUser,
}));

const {
    acknowledgeSecurityIncident,
    createSecurityIncident,
    getAcknowledgedSecurityIncident,
    handleMassDownloadSignal,
    listSecurityIncidents,
} = await import("../securityIncidents.js");

beforeEach(() => {
    vi.clearAllMocks();
    revokeRefreshTokenFamiliesForUser.mockResolvedValue(undefined);
    findOne.mockReturnValue({ lean: findOneLean });
});

describe("security incidents service", () => {
    it("creates incident with default type", async () => {
        create.mockResolvedValue({ _id: "abc" });
        countDocuments.mockResolvedValue(0);

        await createSecurityIncident({
            phase: "pre_cloud",
            reason: "Detected",
            requestPath: "/api/ai/analyze",
        });

        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0].type).toBe("NON_SECURE_CONTENT");
    });

    it("does not revoke session on the first mass download incident", async () => {
        create.mockResolvedValue({
            _id: "mass-1",
            type: "MASS_DOWNLOAD_ATTEMPT",
            detectedAt: new Date("2026-05-09T12:00:00.000Z"),
            context: { userId: "507f1f77bcf86cd799439011" },
        });
        countDocuments.mockResolvedValue(1);

        await createSecurityIncident({
            type: "MASS_DOWNLOAD_ATTEMPT",
            phase: "post_cloud",
            reason: "Volume detecte",
            requestPath: "/api/patients",
            context: { userId: "507f1f77bcf86cd799439011" },
        });

        expect(findAdminUserById).not.toHaveBeenCalled();
    });

    it("revokes active session on the second recent mass download incident", async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const user = {
            refreshTokenHash: "hash",
            refreshTokenExpiresAt: new Date("2026-05-09T13:00:00.000Z"),
            sessionStartedAt: new Date("2026-05-09T11:00:00.000Z"),
            lastActivityAt: new Date("2026-05-09T12:00:00.000Z"),
            lastLogoutAt: null,
            authTokenInvalidBefore: null,
            massDownloadRestrictedUntil: null,
            passwordResetRequired: false,
            save,
        };
        create.mockResolvedValue({
            _id: "mass-2",
            type: "MASS_DOWNLOAD_ATTEMPT",
            detectedAt: new Date("2026-05-09T12:05:00.000Z"),
            context: { userId: "507f1f77bcf86cd799439011" },
        });
        countDocuments.mockResolvedValue(2);
        findAdminUserById.mockResolvedValue(user);

        await createSecurityIncident({
            type: "MASS_DOWNLOAD_ATTEMPT",
            phase: "post_cloud",
            reason: "Volume detecte",
            requestPath: "/api/patients",
            context: { userId: "507f1f77bcf86cd799439011" },
        });

        expect(findAdminUserById).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
        expect(user.refreshTokenHash).toBeNull();
        expect(user.refreshTokenExpiresAt).toBeNull();
        expect(user.sessionStartedAt).toBeNull();
        expect(user.lastActivityAt).toBeNull();
        expect(user.lastLogoutAt).toBeInstanceOf(Date);
        expect(user.authTokenInvalidBefore).toBeInstanceOf(Date);
        expect(user.massDownloadRestrictedUntil).toBeInstanceOf(Date);
        expect(user.passwordResetRequired).toBe(true);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("revokes active session on a silent recurrence during detector cooldown", async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const user = {
            refreshTokenHash: "hash",
            refreshTokenExpiresAt: new Date("2026-05-09T13:00:00.000Z"),
            sessionStartedAt: new Date("2026-05-09T11:00:00.000Z"),
            lastActivityAt: new Date("2026-05-09T12:00:00.000Z"),
            lastLogoutAt: null,
            authTokenInvalidBefore: null,
            massDownloadRestrictedUntil: null,
            passwordResetRequired: false,
            save,
        };
        countDocuments.mockResolvedValue(1);
        findAdminUserById.mockResolvedValue(user);

        const revoked = await handleMassDownloadSignal({
            userId: "507f1f77bcf86cd799439011",
            detectedAt: new Date("2026-05-09T12:05:00.000Z"),
            additionalSignals: 1,
        });

        expect(revoked).toBe(true);
        expect(findAdminUserById).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
        expect(user.refreshTokenHash).toBeNull();
        expect(user.refreshTokenExpiresAt).toBeNull();
        expect(user.sessionStartedAt).toBeNull();
        expect(user.lastActivityAt).toBeNull();
        expect(user.lastLogoutAt).toBeInstanceOf(Date);
        expect(user.authTokenInvalidBefore).toBeInstanceOf(Date);
        expect(user.massDownloadRestrictedUntil).toBeInstanceOf(Date);
        expect(user.passwordResetRequired).toBe(true);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("records only safe acknowledgment metadata once through an atomic update", async () => {
        const incident = {
            _id: "507f1f77bcf86cd799439011",
            acknowledged: true,
            acknowledgmentAction: "J'ai lu et compris",
            acknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
            acknowledgmentContext: { route: "/clinical" },
        };
        findOneAndUpdate.mockResolvedValue(incident);

        const result = await acknowledgeSecurityIncident({
            incidentId: "507f1f77bcf86cd799439011",
            action: "J'ai lu et compris",
            context: { route: "/clinical", userId: "doctor-1" },
        });

        expect(result.acknowledged).toBe(true);
        expect(result.acknowledgmentAction).toBe("J'ai lu et compris");
        expect(result.acknowledgedAt).toBeInstanceOf(Date);
        expect(result.acknowledgmentContext).toEqual({ route: "/clinical" });
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            {
                _id: "507f1f77bcf86cd799439011",
                acknowledged: { $ne: true },
            },
            expect.objectContaining({
                $set: expect.objectContaining({
                    acknowledgmentAction: "J'ai lu et compris",
                    acknowledgmentContext: { route: "/clinical" },
                }),
            }),
            { new: true }
        );
    });

    it("does not reuse an acknowledged incident for a different payload hash", async () => {
        findOneLean.mockResolvedValue(null);

        const result = await getAcknowledgedSecurityIncident(
            "507f1f77bcf86cd799439011",
            "payload-hash-b"
        );

        expect(result).toBeNull();
        expect(findOne).toHaveBeenCalledWith({
            _id: "507f1f77bcf86cd799439011",
            acknowledged: true,
            payloadHash: "payload-hash-b",
        });
    });

    it("rejects any acknowledgment action that does not match required phrase", async () => {
        await expect(
            acknowledgeSecurityIncident({
                incidentId: "507f1f77bcf86cd799439011",
                action: "ok",
            })
        ).rejects.toMatchObject({
            code: "INVALID_ACK_ACTION",
        });
    });

    it("lists security incidents for admins with pagination and filters", async () => {
        countDocuments.mockResolvedValue(2);
        lean.mockResolvedValue([
            {
                _id: "507f1f77bcf86cd799439011",
                type: "MASS_DOWNLOAD_ATTEMPT",
                phase: "post_cloud",
                reason: "Volume detecte",
                requestPath: "/api/patients?page=4&limit=50",
                transport: "http",
                context: { totalCost: 250 },
                detectedAt: new Date("2026-05-09T12:00:00.000Z"),
                acknowledged: false,
                createdAt: new Date("2026-05-09T12:00:00.000Z"),
                updatedAt: new Date("2026-05-09T12:00:00.000Z"),
            },
            {
                _id: "507f1f77bcf86cd799439012",
                type: "NON_SECURE_CONTENT",
                phase: "pre_cloud",
                reason: "Identifiant detecte",
                requestPath: "/api/ai/analyze",
                transport: "openai_chat_completions",
                context: { field: "email" },
                detectedAt: new Date("2026-05-08T12:00:00.000Z"),
                acknowledged: true,
                acknowledgmentAction: "J'ai lu et compris",
                acknowledgedAt: new Date("2026-05-08T12:05:00.000Z"),
                acknowledgmentContext: { userId: "admin-1" },
                createdAt: new Date("2026-05-08T12:00:00.000Z"),
                updatedAt: new Date("2026-05-08T12:05:00.000Z"),
            },
        ]);

        const result = await listSecurityIncidents({
            authUser: { role: "SUPERADMIN" },
            page: "2",
            limit: "10",
            acknowledged: "false",
            type: "mass_download_attempt",
        });

        expect(countDocuments).toHaveBeenCalledWith({
            acknowledged: false,
            type: "MASS_DOWNLOAD_ATTEMPT",
        });
        expect(find).toHaveBeenCalledWith({
            acknowledged: false,
            type: "MASS_DOWNLOAD_ATTEMPT",
        });
        expect(sort).toHaveBeenCalledWith({ detectedAt: -1, createdAt: -1 });
        expect(skip).toHaveBeenCalledWith(10);
        expect(limit).toHaveBeenCalledWith(10);
        expect(result.pagination).toEqual({
            page: 2,
            limit: 10,
            total: 2,
            totalPages: 1,
        });
        expect(result.incidents).toHaveLength(2);
        expect(result.incidents[0]).toMatchObject({
            id: "507f1f77bcf86cd799439011",
            type: "MASS_DOWNLOAD_ATTEMPT",
            acknowledged: false,
        });
    });

    it("rejects invalid security incident pagination", async () => {
        await expect(
            listSecurityIncidents({
                authUser: { role: "ADMIN" },
                page: "0",
                limit: "10",
            })
        ).rejects.toMatchObject({
            code: "INVALID_INPUT",
        });
    });

    it("rejects invalid acknowledged filter", async () => {
        await expect(
            listSecurityIncidents({
                authUser: { role: "ADMIN" },
                acknowledged: "maybe",
            })
        ).rejects.toMatchObject({
            code: "INVALID_INPUT",
        });
    });

    it("rejects non admin access to security incident listing", async () => {
        await expect(
            listSecurityIncidents({
                authUser: { role: "USER" },
            })
        ).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
    });
});
