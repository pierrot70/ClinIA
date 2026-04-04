import { beforeEach, describe, expect, it, vi } from "vitest";

const patientFind = vi.fn();
const patientCountDocuments = vi.fn();
const auditCountDocuments = vi.fn();
const auditFind = vi.fn();

vi.mock("../../models/Patient.js", () => ({
    Patient: {
        find: patientFind,
        countDocuments: patientCountDocuments,
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn(),
        create: vi.fn(),
    },
}));

vi.mock("../../models/PatientAuditLog.js", () => ({
    PatientAuditLog: {
        countDocuments: auditCountDocuments,
        find: auditFind,
    },
}));

vi.mock("../../utils/geocode.js", () => ({
    geocodeFreeAddress: vi.fn(),
}));

const { listPatientAuditLogs } = await import("../patients.js");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("patients service audit logs", () => {
    it("lists patient audit logs with pagination for admins", async () => {
        auditCountDocuments.mockResolvedValue(1);
        auditFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([
                            {
                                _id: "507f1f77bcf86cd799439021",
                                action: "PATIENT_UPDATE",
                                outcome: "SUCCESS",
                                actorUserId: "507f1f77bcf86cd799439011",
                                actorUsernameMasked: "ad***",
                                actorRole: "ADMIN",
                                ip: "203.0.113.10",
                                patientId: "507f1f77bcf86cd799439012",
                                changedFields: ["secure_request_profile"],
                                requestPath: "/api/patients/507f1f77bcf86cd799439012",
                                timestamp: new Date("2026-04-04T10:00:00.000Z"),
                            },
                        ]),
                    }),
                }),
            }),
        });

        const result = await listPatientAuditLogs({
            authUser: { role: "ADMIN" },
            page: "1",
            limit: "20",
            action: "PATIENT_UPDATE",
            patientId: "507f1f77bcf86cd799439012",
            actorUserId: "507f1f77bcf86cd799439011",
            startDate: "2026-04-01",
            endDate: "2026-04-04",
        });

        expect(auditCountDocuments).toHaveBeenCalledWith({
            $and: [
                {
                    timestamp: {
                        $gte: new Date("2026-04-01T00:00:00.000"),
                        $lte: new Date("2026-04-04T23:59:59.999"),
                    },
                },
                { action: "PATIENT_UPDATE" },
                { patientId: "507f1f77bcf86cd799439012" },
                { actorUserId: "507f1f77bcf86cd799439011" },
            ],
        });
        expect(result.pagination.total).toBe(1);
        expect(result.logs[0].action).toBe("PATIENT_UPDATE");
    });

    it("rejects audit access for non-admins", async () => {
        await expect(
            listPatientAuditLogs({
                authUser: { role: "USER" },
            })
        ).rejects.toEqual({
            code: "FORBIDDEN",
            message: "Action reservee aux administrateurs.",
        });
    });
});