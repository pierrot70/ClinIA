import { beforeEach, describe, expect, it, vi } from "vitest";

const countDocuments = vi.fn();
const find = vi.fn();

vi.mock("../../models/WriteOperationAuditLog.js", () => ({
    WriteOperationAuditLog: {
        countDocuments,
        find,
    },
}));

const { listMyWriteReceipts, listWriteOperationAudits } = await import("../writeOperationAudits.js");

function makeFindChain(rows) {
    return {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(rows),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("write operation audits service", () => {
    it("lists filtered write audits with summary counts for admins", async () => {
        const logs = [
            {
                _id: "audit-1",
                collectionName: "patients",
                operation: "CREATE",
                outcome: "SUCCESS",
                verificationId: "WRV-TEST-ABCDEF123456",
                clientMutationId: "client-mutation-1",
                actorUserId: "507f1f77bcf86cd799439011",
                actorUsernameMasked: "do***",
                actorRole: "MEDECIN",
                ip: "203.0.113.10",
                requestId: "request-1",
                instanceId: "instance-1",
                resourceId: "patient-1",
                changedFields: ["nom"],
                requestPath: "/api/patients",
                writeConcern: { w: "majority", j: true, wtimeout: 5000 },
                replicaSet: {
                    status: "DEGRADED",
                    majorityAvailable: true,
                },
                dataClassification: "NO_PATIENT_IDENTIFIERS",
                errorCode: null,
                timestamp: new Date("2026-07-01T12:00:00.000Z"),
            },
        ];
        const summaryRows = [
            {
                collectionName: "patients",
                operation: "CREATE",
                outcome: "SUCCESS",
                actorRole: "MEDECIN",
                replicaSet: {
                    status: "DEGRADED",
                    majorityAvailable: true,
                },
            },
            {
                collectionName: "patients",
                operation: "UPDATE",
                outcome: "SUCCESS",
                actorRole: "MEDECIN",
                replicaSet: {
                    status: "OK",
                    majorityAvailable: true,
                },
            },
        ];

        countDocuments.mockResolvedValue(2);
        find
            .mockReturnValueOnce(makeFindChain(logs))
            .mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue(summaryRows),
            });

        const result = await listWriteOperationAudits({
            authUser: { role: "ADMIN" },
            page: "1",
            limit: "20",
            startDate: "2026-07-01",
            endDate: "2026-07-01",
            collectionName: "patients",
            operation: "create",
            outcome: "success",
            actorRole: "medecin",
            verificationId: "WRV-TEST-ABCDEF123456",
            clientMutationId: "client-mutation-1",
            replicaStatus: "degraded",
            majorityAvailable: "true",
        });

        expect(countDocuments).toHaveBeenCalledWith({
            $and: [
                {
                    timestamp: {
                        $gte: new Date("2026-07-01T00:00:00.000"),
                        $lte: new Date("2026-07-01T23:59:59.999"),
                    },
                },
                { collectionName: "patients" },
                { operation: "CREATE" },
                { outcome: "SUCCESS" },
                { actorRole: "MEDECIN" },
                { verificationId: "WRV-TEST-ABCDEF123456" },
                { clientMutationId: "client-mutation-1" },
                { "replicaSet.status": "DEGRADED" },
                { "replicaSet.majorityAvailable": true },
            ],
        });
        expect(result.summary).toEqual({
            total: 2,
            byCollection: { patients: 2 },
            byOperation: { CREATE: 1, UPDATE: 1 },
            byOutcome: { SUCCESS: 2 },
            byActorRole: { MEDECIN: 2 },
            byReplicaStatus: { DEGRADED: 1, OK: 1 },
            majorityUnavailableCount: 0,
        });
        expect(result.logs[0]).toMatchObject({
            id: "audit-1",
            collectionName: "patients",
            operation: "CREATE",
            outcome: "SUCCESS",
            verificationId: "WRV-TEST-ABCDEF123456",
            clientMutationId: "client-mutation-1",
            actorRole: "MEDECIN",
            resourceId: "patient-1",
        });
    });

    it("rejects non-admin access", async () => {
        await expect(
            listWriteOperationAudits({
                authUser: { role: "MEDECIN" },
            })
        ).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
    });

    it("rejects invalid filters", async () => {
        await expect(
            listWriteOperationAudits({
                authUser: { role: "SUPERADMIN" },
                operation: "DROP",
            })
        ).rejects.toMatchObject({
            code: "INVALID_INPUT",
        });
    });

    it("limits clinician receipt searches to the authenticated user and patient", async () => {
        countDocuments.mockResolvedValue(1);
        find.mockReturnValueOnce(makeFindChain([{
            _id: "audit-2",
            collectionName: "appointments",
            operation: "UPDATE",
            outcome: "SUCCESS",
            verificationId: "WRV-TEST-RECEIPT123",
            actorUserId: "507f1f77bcf86cd799439011",
            patientId: "507f1f77bcf86cd799439012",
            changedFields: ["status"],
            timestamp: new Date("2026-07-02T12:00:00.000Z"),
        }]));

        const result = await listMyWriteReceipts({
            authUser: { role: "MEDECIN", userId: "507f1f77bcf86cd799439011" },
            patientId: "507f1f77bcf86cd799439012",
        });

        expect(countDocuments).toHaveBeenCalledWith({
            $and: [
                { outcome: "SUCCESS" },
                { actorUserId: "507f1f77bcf86cd799439011" },
                { patientId: "507f1f77bcf86cd799439012" },
                { verificationId: { $ne: null } },
                { collectionName: { $ne: "patientauditlogs" } },
            ],
        });
        expect(result.logs).toEqual([expect.objectContaining({
            verificationId: "WRV-TEST-RECEIPT123",
            patientId: "507f1f77bcf86cd799439012",
        })]);
    });
});
