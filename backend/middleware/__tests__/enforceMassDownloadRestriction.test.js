import { describe, expect, it, vi, beforeEach } from "vitest";

const { findById } = vi.hoisted(() => ({
    findById: vi.fn(),
}));

const recordAuthAuditEvent = vi.fn();

vi.mock("../../models/AdminUser.js", () => ({
    AdminUser: {
        findById,
    },
}));

vi.mock("../../audit/authAudit.js", () => ({
    recordAuthAuditEvent,
}));

const { enforceMassDownloadRestriction } = await import("../enforceMassDownloadRestriction.js");

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe("enforceMassDownloadRestriction middleware", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("allows access when no restriction is set", async () => {
        findById.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    _id: "user-1",
                    username: "doctor.one",
                    role: "MEDECIN",
                    massDownloadRestrictedUntil: null,
                }),
            }),
        });

        const middleware = enforceMassDownloadRestriction();
        const req = {
            auth: { userId: "user-1" },
            headers: {},
            ip: "127.0.0.1",
        };
        const res = makeRes();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(recordAuthAuditEvent).not.toHaveBeenCalled();
    });

    it("allows access when the restriction has expired", async () => {
        findById.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    _id: "user-1",
                    username: "doctor.one",
                    role: "MEDECIN",
                    massDownloadRestrictedUntil: new Date(Date.now() - 5_000),
                }),
            }),
        });

        const middleware = enforceMassDownloadRestriction();
        const req = {
            auth: { userId: "user-1" },
            headers: {},
            ip: "127.0.0.1",
        };
        const res = makeRes();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(recordAuthAuditEvent).not.toHaveBeenCalled();
    });

    it("blocks access when the restriction is still active", async () => {
        const restrictedUntil = new Date(Date.now() + 10 * 60 * 1000);
        findById.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    _id: "user-1",
                    username: "doctor.one",
                    role: "MEDECIN",
                    massDownloadRestrictedUntil: restrictedUntil,
                }),
            }),
        });

        const middleware = enforceMassDownloadRestriction();
        const req = {
            auth: { userId: "user-1" },
            headers: {
                "x-forwarded-for": "203.0.113.5, 127.0.0.1",
            },
            ip: "127.0.0.1",
        };
        const res = makeRes();
        const next = vi.fn();

        await middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(recordAuthAuditEvent).toHaveBeenCalledWith({
            action: "RESTRICTED_ACCESS_BLOCKED",
            outcome: "BLOCKED",
            userId: "user-1",
            username: "doctor.one",
            role: "MEDECIN",
            ip: "203.0.113.5",
            reason: "MASS_DOWNLOAD_RESTRICTION_ACTIVE",
        });
        expect(res.status).toHaveBeenCalledWith(423);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "ACCOUNT_TEMPORARILY_RESTRICTED",
                message:
                    "Acces temporairement restreint apres un incident de securite. Reessayez plus tard ou contactez un SUPERADMIN.",
                retryable: false,
                restrictedUntil: restrictedUntil.toISOString(),
            },
        });
    });
});
