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
                { collectionName: { $nin: ["patientauditlogs", "patientclinicalnoteversions"] } },
            ],
        });
        expect(result.logs).toEqual([expect.objectContaining({
            verificationId: "WRV-TEST-RECEIPT123",
            patientId: "507f1f77bcf86cd799439012",
        })]);
    });
});


describe("personal receipts for reception", () => {
    const actorId = "507f1f77bcf86cd799439021";
    const otherActorId = "507f1f77bcf86cd799439022";

    it("forces the authenticated reception author and successful verified receipts despite forged actor filters", async () => {
        countDocuments.mockResolvedValue(1);
        find.mockReturnValueOnce(makeFindChain([{
            _id: "synthetic-audit",
            verificationId: "WRV-SYNTHETIC-RECEPTION",
            collectionName: "appointments", operation: "CREATE", outcome: "SUCCESS",
            actorUserId: actorId, actorUsernameMasked: "synthetic-actor", actorRole: "RECEPTION",
            patientId: "507f1f77bcf86cd799439023", resourceId: "synthetic-resource",
            changedFields: ["date", "time"],
            writeConcern: { w: "majority", j: true },
            replicaSet: { status: "OK", majorityAvailable: true },
            timestamp: new Date("2030-01-01T12:00:00Z"),
            ip: "203.0.113.10", requestPath: "/api/reception/walk-in-bookings",
            requestId: "synthetic-request", instanceId: "synthetic-instance",
            patientName: "synthetic-patient", errorCode: "synthetic-error",
        }]));
        const result = await listMyWriteReceipts({
            authUser: { role: "RECEPTION", userId: actorId },
            actorUserId: otherActorId, actorRole: "SUPERADMIN", outcome: "FAILED",
        });
        const expectedQuery = { $and: [
            { outcome: "SUCCESS" }, { actorUserId: actorId },
            { verificationId: { $ne: null } },
            { collectionName: { $nin: ["patientauditlogs", "patientclinicalnoteversions"] } },
        ] };
        expect(countDocuments).toHaveBeenCalledExactlyOnceWith(expectedQuery);
        expect(find).toHaveBeenCalledExactlyOnceWith(expectedQuery);
        expect(result.pagination.total).toBe(1);
        expect(result.logs[0]).toMatchObject({ verificationId: "WRV-SYNTHETIC-RECEPTION", collectionName: "appointments" });
        expect(Object.keys(result.logs[0]).sort()).toEqual([
            "verificationId", "collectionName", "operation", "resourceId", "patientId",
            "changedFields", "writeConcern", "replicaSet", "timestamp",
        ].sort());
    });

    it("continues to deny reception access to administrative audit listings before reading the database", async () => {
        await expect(listWriteOperationAudits({ authUser: { role: "RECEPTION", userId: actorId } }))
            .rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(countDocuments).not.toHaveBeenCalled();
        expect(find).not.toHaveBeenCalled();
    });

    it.each([null, {}, { role: "RECEPTION" }, { role: "RECEPTION", userId: "" }, { role: "UNSUPPORTED", userId: actorId }])(
        "denies missing or unsupported receipt authentication before any database read (%j)", async authUser => {
            await expect(listMyWriteReceipts({ authUser })).rejects.toMatchObject({ code: "FORBIDDEN" });
            expect(countDocuments).not.toHaveBeenCalled();
            expect(find).not.toHaveBeenCalled();
        }
    );
});


describe("personal receipt UTC day boundaries", () => {
    const authUser = { role: "RECEPTION", userId: "507f1f77bcf86cd799439041" };
    beforeEach(() => {
        countDocuments.mockResolvedValue(0);
        find.mockReturnValue(makeFindChain([]));
    });
    function timestampClause() { return countDocuments.mock.calls[0][0].$and.find(clause => clause.timestamp).timestamp; }

    it.each([
        ["Paris, October 31", "2026-10-30T23:00:00.000Z", "2026-10-31T23:00:00.000Z", 24],
        ["Toronto, same local date", "2026-10-31T04:00:00.000Z", "2026-11-01T04:00:00.000Z", 24],
        ["Paris spring DST day", "2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z", 23],
        ["Toronto autumn DST day", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z", 25],
    ])("uses the exact browser-computed UTC range for %s", async (_case, startAt, endBefore, hours) => {
        await listMyWriteReceipts({ authUser, startAt, endBefore,
            actorUserId: "507f1f77bcf86cd799439042", actorRole: "SUPERADMIN", outcome: "FAILED" });
        const timestamp = timestampClause();
        expect(timestamp).toEqual({ $gte: new Date(startAt), $lt: new Date(endBefore) });
        expect((timestamp.$lt.getTime() - timestamp.$gte.getTime()) / 3_600_000).toBe(hours);
        const query = countDocuments.mock.calls[0][0];
        expect(query.$and).toContainEqual({ actorUserId: authUser.userId });
        expect(query.$and).toContainEqual({ outcome: "SUCCESS" });
        expect(find).toHaveBeenCalledExactlyOnceWith(query);
    });

    it.each([
        [{ startAt: "2026-10-31T04:00:00.000Z" }, { $gte: new Date("2026-10-31T04:00:00.000Z") }],
        [{ endBefore: "2026-11-01T04:00:00.000Z" }, { $lt: new Date("2026-11-01T04:00:00.000Z") }],
    ])("supports a single explicit bound without inventing the other (%j)", async (bounds, expected) => {
        await listMyWriteReceipts({ authUser, ...bounds });
        expect(timestampClause()).toEqual(expected);
    });

    it("preserves legacy day filters and their inclusive end for old clients", async () => {
        await listMyWriteReceipts({ authUser, startDate: "2026-10-31", endDate: "2026-10-31" });
        expect(timestampClause()).toEqual({
            $gte: new Date("2026-10-31T00:00:00.000"),
            $lte: new Date("2026-10-31T23:59:59.999"),
        });
    });

    it("ignores only legacy boundaries replaced by explicit UTC bounds", async () => {
        await listMyWriteReceipts({ authUser,
            startAt: "2026-10-31T04:00:00.000Z", startDate: "unused invalid date",
            endDate: "2026-10-31" });
        expect(timestampClause()).toEqual({ $gte: new Date("2026-10-31T04:00:00.000Z"), $lte: new Date("2026-10-31T23:59:59.999") });
    });

    it("retains the legacy start when only the end is explicitly UTC", async () => {
        await listMyWriteReceipts({ authUser, startDate: "2026-10-31",
            endBefore: "2026-11-01T04:00:00.000Z", endDate: ["unused malformed legacy date"] });
        expect(timestampClause()).toEqual({ $gte: new Date("2026-10-31T00:00:00.000"), $lt: new Date("2026-11-01T04:00:00.000Z") });
    });

    const malformed = [null, 123, [], ["2026-10-31T00:00:00.000Z"], {},
        "", " 2026-10-31T00:00:00.000Z", "2026-10-31", "2026-10-31T00:00:00Z",
        "2026-10-31T01:00:00.000+01:00", "2026-10-31T24:00:00.000Z", "2026-02-30T00:00:00.000Z"];
    it.each(malformed)("rejects a noncanonical startAt before a database read (%j)", async startAt => {
        await expect(listMyWriteReceipts({ authUser, startAt })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(countDocuments).not.toHaveBeenCalled(); expect(find).not.toHaveBeenCalled();
    });
    it.each(malformed)("rejects a noncanonical endBefore before a database read (%j)", async endBefore => {
        await expect(listMyWriteReceipts({ authUser, endBefore })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(countDocuments).not.toHaveBeenCalled(); expect(find).not.toHaveBeenCalled();
    });

    it.each([
        { startAt: "2026-11-01T04:00:00.000Z", endBefore: "2026-11-01T04:00:00.000Z" },
        { startAt: "2026-11-02T04:00:00.000Z", endBefore: "2026-11-01T04:00:00.000Z" },
        { startDate: "2026-11-02", endBefore: "2026-11-01T04:00:00.000Z" },
        { startDate: "2026-11-02", endDate: "2026-11-01" },
        { startAt: "2026-10-31T04:00:00.000Z", endDate: "invalid" },
        { startDate: "invalid", endBefore: "2026-11-01T04:00:00.000Z" },
        { startDate: "2026-02-30" }, { endDate: "2026-02-30" },
        { startDate: ["2026-10-31"] }, { endDate: {} },
    ])("rejects inverted or invalid used legacy boundaries before DB (%j)", async bounds => {
        await expect(listMyWriteReceipts({ authUser, ...bounds })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(countDocuments).not.toHaveBeenCalled(); expect(find).not.toHaveBeenCalled();
    });

    it("does not add a time filter when every boundary is omitted", async () => {
        await listMyWriteReceipts({ authUser });
        expect(countDocuments.mock.calls[0][0].$and.some(clause => clause.timestamp)).toBe(false);
    });

    it("does not change administrative date semantics or accept new UTC filters there", async () => {
        countDocuments.mockResolvedValue(0);
        find.mockReturnValue({ ...makeFindChain([]), lean: vi.fn().mockResolvedValue([]) });
        await listWriteOperationAudits({ authUser: { role: "ADMIN" },
            startDate: "2026-10-31", endDate: "2026-10-31",
            startAt: "malformed unused admin parameter", endBefore: [] });
        expect(timestampClause()).toEqual({
            $gte: new Date("2026-10-31T00:00:00.000"),
            $lte: new Date("2026-10-31T23:59:59.999"),
        });
    });
});
