import { beforeEach, describe, expect, it, vi } from "vitest";

const patientFind = vi.fn();
const patientCountDocuments = vi.fn();
const patientFindOne = vi.fn();
const patientExists = vi.fn();
const patientSave = vi.fn();
const auditCountDocuments = vi.fn();
const auditFind = vi.fn();
const secureRequestSnapshotFind = vi.fn();
const secureRequestSnapshotFindOneAndUpdate = vi.fn();

const PatientModel = vi.fn();
PatientModel.find = patientFind;
PatientModel.countDocuments = patientCountDocuments;
PatientModel.findOne = patientFindOne;
PatientModel.exists = patientExists;
PatientModel.findOneAndUpdate = vi.fn();
PatientModel.findOneAndDelete = vi.fn();
PatientModel.create = vi.fn();

vi.mock("../../models/Patient.js", () => ({
    Patient: PatientModel,
}));

vi.mock("../../models/PatientAuditLog.js", () => ({
    PatientAuditLog: {
        countDocuments: auditCountDocuments,
        find: auditFind,
    },
}));

vi.mock("../../models/PatientSecureRequestSnapshot.js", () => ({
    PatientSecureRequestSnapshot: {
        find: secureRequestSnapshotFind,
        findOneAndUpdate: secureRequestSnapshotFindOneAndUpdate,
    },
}));

const {
    createPatient,
    archivePatient,
    restorePatient,
    listPatients,
    listPatientAuditLogs,
    listPatientSecureRequestDocuments,
} = await import("../patients.js");

beforeEach(() => {
    vi.clearAllMocks();
    PatientModel.mockImplementation((patient) => ({
        ...patient,
        save: patientSave,
    }));
});

describe("patients service audit logs", () => {
    it("requires explicit confirmation before creating a same-name patient without insurance number", async () => {
        patientExists.mockResolvedValue({ _id: "existing-patient" });

        await expect(
            createPatient(
                { nom: "Spenard", prenom: "Mickey" },
                { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
            )
        ).rejects.toMatchObject({ code: "POTENTIAL_DUPLICATE" });

        expect(patientExists).toHaveBeenCalledWith({
            ownerUserId: "507f1f77bcf86cd799439011",
            archivedAt: null,
            nomSearch: "spenard",
            prenomSearch: "mickey",
        });
        expect(patientSave).not.toHaveBeenCalled();
    });

    it("excludes archived patients from active searches", async () => {
        patientCountDocuments.mockResolvedValue(0);
        patientFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([]),
                    }),
                }),
            }),
        });

        await listPatients(
            {},
            {},
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(patientFind).toHaveBeenCalledWith({
            ownerUserId: "507f1f77bcf86cd799439011",
            archivedAt: null,
        });
    });

    it("lists archived dossiers only when explicitly requested", async () => {
        patientCountDocuments.mockResolvedValue(0);
        patientFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([]),
                    }),
                }),
            }),
        });

        await listPatients(
            {},
            { archiveStatus: "archived" },
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(patientFind).toHaveBeenCalledWith({
            ownerUserId: "507f1f77bcf86cd799439011",
            archivedAt: { $ne: null },
        });
    });

    it("archives a patient instead of deleting the dossier", async () => {
        PatientModel.findOneAndUpdate.mockResolvedValue({ _id: "patient-archive" });

        const archived = await archivePatient(
            "507f1f77bcf86cd799439012",
            "Doublon confirmé",
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(archived).toEqual({ _id: "patient-archive" });
        expect(PatientModel.findOneAndDelete).not.toHaveBeenCalled();
        expect(PatientModel.findOneAndUpdate).toHaveBeenCalledWith(
            {
                _id: "507f1f77bcf86cd799439012",
                ownerUserId: "507f1f77bcf86cd799439011",
                archivedAt: null,
            },
            {
                $set: expect.objectContaining({
                    archivedByUserId: "507f1f77bcf86cd799439011",
                    archiveReason: "Doublon confirmé",
                    archivedAt: expect.any(Date),
                }),
            },
            expect.objectContaining({ new: true, runValidators: true })
        );
    });

    it("restores an archived patient without deleting clinical data", async () => {
        PatientModel.findOneAndUpdate.mockResolvedValue({ _id: "patient-restored" });

        const restored = await restorePatient(
            "507f1f77bcf86cd799439012",
            "Demande administrative",
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(restored).toEqual({ _id: "patient-restored" });
        expect(PatientModel.findOneAndDelete).not.toHaveBeenCalled();
        expect(PatientModel.findOneAndUpdate).toHaveBeenCalledWith(
            {
                _id: "507f1f77bcf86cd799439012",
                ownerUserId: "507f1f77bcf86cd799439011",
                archivedAt: { $ne: null },
            },
            {
                $set: {
                    archivedAt: null,
                    archivedByUserId: null,
                    archiveReason: "",
                },
            },
            expect.objectContaining({ new: true, runValidators: true })
        );
    });

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
            archivedAt: null,
            $and: [
                {
                    $or: [
                        { nomSearch: /^pierre/ },
                        { prenomSearch: /^pierre/ },
                    ],
                },
                {
                    $or: [
                        { nomSearch: /^lasante/ },
                        { prenomSearch: /^lasante/ },
                    ],
                },
            ],
        });
        expect(result.data).toHaveLength(1);
    });

    it("escapes every direct patient search filter before using it as a Mongo regex", async () => {
        patientCountDocuments.mockResolvedValue(0);
        patientFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([]),
                    }),
                }),
            }),
        });

        await listPatients(
            {
                nom: ".*(Pierre)+",
                prenom: "[Anne]",
                num_assurance_maladie: "RAMQ(123)+",
                telephone: "+1(514).*",
                addresse: "123 rue [Test]",
            },
            {},
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(patientFind).toHaveBeenCalledWith({
            ownerUserId: "507f1f77bcf86cd799439011",
            archivedAt: null,
            nomSearch: { $regex: /^\.\*\(pierre\)\+/ },
            prenomSearch: { $regex: /^\[anne\]/ },
            healthInsuranceNumberSearch: { $regex: /^RAMQ123/ },
            telephoneSearch: { $regex: /^1514/ },
            addresseSearch: { $regex: /^123 rue \[test\]/ },
        });
    });

    it("limits the general search to four escaped terms", async () => {
        patientCountDocuments.mockResolvedValue(0);
        patientFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([]),
                    }),
                }),
            }),
        });

        await listPatients(
            { q: "un deux trois quatre cinq six" },
            {},
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        const query = patientFind.mock.calls[0][0];
        expect(query.$and).toHaveLength(4);
        expect(query.$and.map((condition) => condition.$or[0].nomSearch.source)).toEqual([
            "^un",
            "^deux",
            "^trois",
            "^quatre",
        ]);
    });

    it("limits direct patient search patterns to 80 characters", async () => {
        patientCountDocuments.mockResolvedValue(0);
        patientFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([]),
                    }),
                }),
            }),
        });

        await listPatients(
            { nom: "a".repeat(120) },
            {},
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(
            patientFind.mock.calls[0][0].nomSearch.$regex.source
        ).toHaveLength(81);
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
        secureRequestSnapshotFind.mockReturnValue({
            sort: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    {
                        _id: "snapshot-oncology",
                        clinicalScope: "Oncology",
                        objective: "Therapeutic adjustment",
                        selectedDocumentIds: ["doc-1"],
                        updatedAt: new Date("2026-04-05T10:30:00.000Z"),
                    },
                    {
                        _id: "snapshot-general",
                        clinicalScope: "General medicine",
                        objective: "Initial therapy",
                        selectedDocumentIds: ["doc-2", "doc-3"],
                        updatedAt: new Date("2026-04-05T08:00:00.000Z"),
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
        expect(secureRequestSnapshotFind).toHaveBeenCalledWith({
            patientId: "507f1f77bcf86cd799439012",
        });
        expect(result).toEqual([
            {
                id: "secure-request-snapshot:snapshot-oncology",
                title: "Oncology",
                type: "Derniere requete securisee",
                uploadedAt: new Date("2026-04-05T10:30:00.000Z"),
                sourceAuditLogId: null,
                clinicalScope: "Oncology",
                objective: "Therapeutic adjustment",
                selectedDocumentIds: ["doc-1"],
            },
            {
                id: "secure-request-snapshot:snapshot-general",
                title: "General medicine",
                type: "Derniere requete securisee",
                uploadedAt: new Date("2026-04-05T08:00:00.000Z"),
                sourceAuditLogId: null,
                clinicalScope: "General medicine",
                objective: "Initial therapy",
                selectedDocumentIds: ["doc-2", "doc-3"],
            },
        ]);
    });
});
