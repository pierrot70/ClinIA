import { beforeEach, describe, expect, it, vi } from "vitest";

const patientFind = vi.fn();
const patientCountDocuments = vi.fn();
const patientFindOne = vi.fn();
const auditCountDocuments = vi.fn();
const auditFind = vi.fn();

vi.mock("../../models/Patient.js", () => ({
    Patient: {
        find: patientFind,
        countDocuments: patientCountDocuments,
        findOne: patientFindOne,
        findOneAndUpdate: vi.fn(),
        findOneAndDelete: vi.fn(),
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

const {
    listPatients,
    listPatientAuditLogs,
    listPatientSecureRequestDocuments,
} = await import("../patients.js");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("patients service audit logs", () => {
    it("searches a clinician's patients by first and last name without regex injection", async () => {
        patientCountDocuments.mockResolvedValue(1);
        patientFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([{ _id: "patient-1", prenom: "Pierre", nom: "Lasante" }]),
                    }),
                }),
            }),
        });

        const result = await listPatients(
            { q: "Pierre Lasante" },
            { page: "1", limit: "50", sortBy: "nom" },
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(patientFind).toHaveBeenCalledWith({
            ownerUserId: "507f1f77bcf86cd799439011",
            $and: [
                { $or: [{ nom: /Pierre/i }, { prenom: /Pierre/i }] },
                { $or: [{ nom: /Lasante/i }, { prenom: /Lasante/i }] },
            ],
        });
        expect(result.data).toHaveLength(1);
    });

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

    it("returns the latest secure request document for each specialty", async () => {
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                prenom: "Patient",
                nom: "Pierrot",
            }),
        });
        auditFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    {
                        _id: "audit-oncology-new",
                        action: "PATIENT_UPDATE",
                        changedFields: ["secure_request_profile"],
                        timestamp: new Date("2026-04-05T10:30:00.000Z"),
                        context: {
                            secureRequest: {
                                clinicalScope: "Oncology",
                                objective: "Therapeutic adjustment",
                                selectedDocumentIds: ["doc-1"],
                            },
                        },
                    },
                    {
                        _id: "audit-oncology-old",
                        action: "PATIENT_UPDATE",
                        changedFields: ["secure_request_profile"],
                        timestamp: new Date("2026-04-05T09:00:00.000Z"),
                        context: {
                            secureRequest: {
                                clinicalScope: "Oncology",
                                objective: "Earlier request",
                                selectedDocumentIds: [],
                            },
                        },
                    },
                    {
                        _id: "audit-general",
                        action: "PATIENT_UPDATE",
                        changedFields: ["secure_request_profile"],
                        timestamp: new Date("2026-04-05T08:00:00.000Z"),
                        context: {
                            secureRequest: {
                                clinicalScope: "General medicine",
                                objective: "Initial therapy",
                                selectedDocumentIds: ["doc-2", "doc-3"],
                            },
                        },
                    },
                    {
                        _id: "audit-empty-scope",
                        action: "PATIENT_UPDATE",
                        changedFields: ["secure_request_profile"],
                        timestamp: new Date("2026-04-05T07:00:00.000Z"),
                        context: {
                            secureRequest: {
                                clinicalScope: "",
                            },
                        },
                    },
                ]),
            }),
        });

        const result = await listPatientSecureRequestDocuments(
            "507f1f77bcf86cd799439012",
            {
                userId: "507f1f77bcf86cd799439099",
                role: "MEDECIN",
            }
        );

        expect(patientFindOne).toHaveBeenCalledWith({
            _id: "507f1f77bcf86cd799439012",
            ownerUserId: "507f1f77bcf86cd799439099",
        });
        expect(auditFind).toHaveBeenCalledWith({
            patientId: "507f1f77bcf86cd799439012",
            action: "PATIENT_UPDATE",
            changedFields: "secure_request_profile",
        });
        expect(result).toEqual([
            {
                id: "secure-request-log:audit-oncology-new",
                title: "Oncology",
                type: "Derniere requete securisee",
                uploadedAt: new Date("2026-04-05T10:30:00.000Z"),
                sourceAuditLogId: "audit-oncology-new",
                clinicalScope: "Oncology",
                objective: "Therapeutic adjustment",
                selectedDocumentIds: ["doc-1"],
            },
            {
                id: "secure-request-log:audit-general",
                title: "General medicine",
                type: "Derniere requete securisee",
                uploadedAt: new Date("2026-04-05T08:00:00.000Z"),
                sourceAuditLogId: "audit-general",
                clinicalScope: "General medicine",
                objective: "Initial therapy",
                selectedDocumentIds: ["doc-2", "doc-3"],
            },
        ]);
    });
});
