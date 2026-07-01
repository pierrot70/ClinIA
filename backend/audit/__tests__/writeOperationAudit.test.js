import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("../../models/WriteOperationAuditLog.js", () => ({
    WriteOperationAuditLog: {
        create,
    },
}));

const { recordWriteOperationAuditEvent } = await import("../writeOperationAudit.js");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("write operation audit privacy", () => {
    it("stores technical write metadata and replica status without patient identifiers", async () => {
        await recordWriteOperationAuditEvent({
            collectionName: "patients",
            operation: "UPDATE",
            outcome: "SUCCESS",
            actorUserId: "507f1f77bcf86cd799439011",
            actorUsername: "Doctor.Email@clinia.local",
            actorRole: "MEDECIN",
            ip: "203.0.113.10",
            requestId: "request-1",
            instanceId: "instance-1",
            resourceId: "patient-technical-id",
            changedFields: ["nom", "telephone", "nom"],
            requestPath: "/api/patients/patient-technical-id",
            writeConcern: {
                w: "majority",
                j: true,
                wtimeout: 5000,
            },
            replicaSet: {
                summary: {
                    status: "DEGRADED",
                    memberCount: 3,
                    healthyCount: 2,
                    primaryCount: 1,
                    secondaryCount: 1,
                    majorityAvailable: true,
                    maxLagSeconds: 0,
                    laggingThresholdSeconds: 10,
                },
            },
        });

        expect(create).toHaveBeenCalledWith({
            collectionName: "patients",
            operation: "UPDATE",
            outcome: "SUCCESS",
            actorUserId: "507f1f77bcf86cd799439011",
            actorUsernameMasked: "do***",
            actorRole: "MEDECIN",
            ip: "203.0.113.10",
            requestId: "request-1",
            instanceId: "instance-1",
            resourceId: "patient-technical-id",
            changedFields: ["nom", "telephone"],
            requestPath: "/api/patients/patient-technical-id",
            writeConcern: {
                w: "majority",
                j: true,
                wtimeout: 5000,
            },
            replicaSet: {
                status: "DEGRADED",
                memberCount: 3,
                healthyCount: 2,
                primaryCount: 1,
                secondaryCount: 1,
                majorityAvailable: true,
                maxLagSeconds: 0,
                laggingThresholdSeconds: 10,
                checkedAt: expect.any(Date),
            },
            dataClassification: "NO_PATIENT_IDENTIFIERS",
            errorCode: null,
            timestamp: expect.any(Date),
        });

        const serialized = JSON.stringify(create.mock.calls[0][0]);
        expect(serialized).not.toContain("Doctor.Email@clinia.local");
        expect(serialized).not.toContain("RAMQ1234567890");
        expect(serialized).not.toContain("514-555-1212");
    });

    it("does not throw when audit persistence fails", async () => {
        create.mockRejectedValueOnce(new Error("mongo unavailable"));

        await expect(
            recordWriteOperationAuditEvent({
                collectionName: "appointments",
                operation: "CREATE",
                outcome: "SUCCESS",
            })
        ).resolves.toBeUndefined();
    });
});
