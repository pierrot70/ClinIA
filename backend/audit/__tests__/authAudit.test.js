import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("../../models/AuthAuditLog.js", () => ({
    AuthAuditLog: {
        create,
    },
}));

const { recordAuthAuditEvent } = await import("../authAudit.js");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("auth audit privacy", () => {
    it("stores only masked usernames and required audit metadata", async () => {
        await recordAuthAuditEvent({
            action: "LOGIN",
            outcome: "SUCCESS",
            userId: "507f1f77bcf86cd799439011",
            username: "Doctor.Email@clinia.local",
            role: "MEDECIN",
            ip: "203.0.113.10",
        });

        expect(create).toHaveBeenCalledWith({
            action: "LOGIN",
            outcome: "SUCCESS",
            userId: "507f1f77bcf86cd799439011",
            usernameMasked: "do***",
            actorUsername: null,
            targetUsername: null,
            role: "MEDECIN",
            ip: "203.0.113.10",
            reason: null,
            timestamp: expect.any(Date),
        });

        const payload = create.mock.calls[0][0];
        expect(payload.username).toBeUndefined();
        expect(payload.email).toBeUndefined();
        expect(payload.password).toBeUndefined();
        expect(payload.accessToken).toBeUndefined();
        expect(payload.refreshToken).toBeUndefined();
    });

    it("does not persist patient identifiers accidentally passed as username", async () => {
        await recordAuthAuditEvent({
            action: "FAILED_LOGIN",
            outcome: "FAILED",
            username: "Jean Tremblay jean.tremblay@example.com 514-555-1212 RAMQ1234567890",
            ip: "203.0.113.11",
            reason: "INVALID_CREDENTIALS",
        });

        const payload = create.mock.calls[0][0];
        const serialized = JSON.stringify(payload);

        expect(payload.usernameMasked).toBe("je***");
        expect(serialized).not.toContain("Jean Tremblay");
        expect(serialized).not.toContain("jean.tremblay@example.com");
        expect(serialized).not.toContain("514-555-1212");
        expect(serialized).not.toContain("RAMQ1234567890");
    });

    it("stores explicit actor and target usernames for password administration events", async () => {
        await recordAuthAuditEvent({
            action: "USER_MANAGEMENT",
            outcome: "SUCCESS",
            userId: "507f1f77bcf86cd799439011",
            username: "superadmin",
            actorUsername: "SuperAdmin",
            targetUsername: "pierrot.lasante",
            role: "SUPERADMIN",
            ip: "203.0.113.12",
            reason: "RESET_PASSWORD:507f1f77bcf86cd799439099",
        });

        expect(create).toHaveBeenCalledWith({
            action: "USER_MANAGEMENT",
            outcome: "SUCCESS",
            userId: "507f1f77bcf86cd799439011",
            usernameMasked: "su***",
            actorUsername: "superadmin",
            targetUsername: "pierrot.lasante",
            role: "SUPERADMIN",
            ip: "203.0.113.12",
            reason: "RESET_PASSWORD:507f1f77bcf86cd799439099",
            timestamp: expect.any(Date),
        });
    });
});
