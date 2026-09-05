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
const transactionSession = {
    withTransaction: vi.fn(async (callback) => callback()),
    endSession: vi.fn(),
};
const startSession = vi.fn(async () => transactionSession);
const recordPatientAuditEvent = vi.fn();
const recordWriteOperationAuditEvent = vi.fn();
const getActiveDelegatedPatientAccess = vi.fn();

function patientListQuery(rows = []) {
    return {
        select: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
                skip: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue(rows),
                    }),
                }),
            }),
        }),
    };
}

vi.mock("mongoose", () => ({
    default: {
        startSession,
        Types: { ObjectId: { isValid: vi.fn(() => true) } },
    },
}));

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

vi.mock("../../models/PatientClinicalNoteVersion.js", () => ({
    PatientClinicalNoteVersion: {
        findOne: vi.fn(),
        create: vi.fn(),
    },
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

vi.mock("../../audit/patientAudit.js", () => ({ recordPatientAuditEvent }));
vi.mock("../../audit/writeOperationAudit.js", () => ({ recordWriteOperationAuditEvent }));
vi.mock("../clinicalSupportAccess.js", () => ({ getActiveDelegatedPatientAccess }));

const {
    createPatient,
    createPatientWithWriteVerification,
    updatePatientWithWriteVerification,
    archivePatientWithWriteVerification,
    restorePatientWithWriteVerification,
    archivePatient,
    restorePatient,
    listPatients,
    listPatientAuditLogs,
    listPatientSecureRequestDocuments,
} = await import("../patients.js");

beforeEach(() => {
    vi.clearAllMocks();
    PatientModel.mockImplementation(function PatientDocument(patient) {
        return {
            ...patient,
            save: patientSave,
        };
    });
    transactionSession.withTransaction.mockImplementation(async (callback) => callback());
    transactionSession.endSession.mockResolvedValue();
    recordPatientAuditEvent.mockResolvedValue({ _id: "patient-audit-1" });
    recordWriteOperationAuditEvent.mockResolvedValue(true);
});

describe("patients service audit logs", () => {
    it("leaves a reception-created patient without permanent care, ignoring a DTO owner", async () => {
        patientSave.mockResolvedValue({ _id: "new-patient" });
        await createPatient({ nom: "Test", prenom: "Demo", num_assurance_maladie: "123456", ownerUserId: "client-supplied" },
            { userId: "reception-user", role: "RECEPTION" },
            { session: transactionSession, receivingPhysicianUserId: "physician-user" });
        expect(PatientModel).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: null }));
        expect(patientSave).toHaveBeenCalledWith(expect.objectContaining({ session: transactionSession }));
    });

    it.each([
        ["RECEPTION", {}],
        ["RECEPTION", { receivingPhysicianUserId: "physician-user" }],
        ["MEDECIN", { session: transactionSession, receivingPhysicianUserId: "other-user" }],
    ])("rejects unsupported clinical owner assignment for %s", async (role, options) => {
        await expect(createPatient({ nom: "Test", prenom: "Demo" }, { userId: "actor", role }, options)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(PatientModel).not.toHaveBeenCalled();
    });
    it("does not perform a cross-owner duplicate lookup for the same patient identifiers", async () => {
        patientSave
            .mockResolvedValueOnce({ _id: "patient-owner-one" })
            .mockResolvedValueOnce({ _id: "patient-owner-two" });
        const dto = {
            nom: "Doe",
            prenom: "Jane",
            telephone: "5145550101",
            num_assurance_maladie: "RAMQ1234567890",
        };

        await createPatient(dto, { userId: "owner-one", role: "MEDECIN" });
        await createPatient(dto, { userId: "owner-two", role: "MEDECIN" });

        expect(patientExists).not.toHaveBeenCalled();
        expect(PatientModel).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ ownerUserId: "owner-one" })
        );
        expect(PatientModel).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ ownerUserId: "owner-two" })
        );
    });

    it("commits a patient creation and all receipt audits in one Mongo transaction", async () => {
        patientExists.mockResolvedValue(null);
        patientSave.mockResolvedValue({ _id: "patient-atomic" });
        const audit = {
            action: "PATIENT_CREATE",
            operation: "CREATE",
            verificationId: "WRV-ATOMIC",
            clientMutationId: "mutation-1",
            actorUserId: "user-1",
            actorUsername: "doctor.one",
            actorRole: "MEDECIN",
            ip: "10.0.0.1",
            requestId: "request-1",
            instanceId: "instance-1",
            requestPath: "/api/patients",
            changedFields: ["nom", "prenom"],
            context: null,
            replicaSet: { summary: { status: "OK" } },
        };

        const result = await createPatientWithWriteVerification(
            { nom: "Doe", prenom: "Jane" },
            { userId: "user-1", role: "MEDECIN" },
            { audit }
        );

        expect(startSession).toHaveBeenCalledTimes(1);
        expect(transactionSession.withTransaction).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ writeConcern: expect.objectContaining({ w: "majority" }) })
        );
        expect(patientSave).toHaveBeenCalledWith(expect.objectContaining({ session: transactionSession }));
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            session: transactionSession,
            throwOnError: true,
            patientId: "patient-atomic",
        }));
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledTimes(2);
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            collectionName: "patients",
            verificationId: "WRV-ATOMIC",
            session: transactionSession,
            throwOnError: true,
        }));
        expect(result).toEqual({
            patient: { _id: "patient-atomic" },
            writeVerification: {
                status: "CONFIRMED",
                verificationId: "WRV-ATOMIC",
                clientMutationId: "mutation-1",
            },
        });
    });

    it("aborts a priority write when receipt persistence fails", async () => {
        patientExists.mockResolvedValue(null);
        patientSave.mockResolvedValue({ _id: "patient-atomic" });
        recordWriteOperationAuditEvent.mockRejectedValueOnce(new Error("audit unavailable"));

        await expect(createPatientWithWriteVerification(
            { nom: "Doe", prenom: "Jane" },
            { userId: "user-1", role: "MEDECIN" },
            { audit: {
                action: "PATIENT_CREATE", operation: "CREATE", verificationId: "WRV-ATOMIC",
                clientMutationId: null, actorUserId: "user-1", actorUsername: "doctor.one",
                actorRole: "MEDECIN", ip: null, requestId: "request-1", instanceId: "instance-1",
                requestPath: "/api/patients", changedFields: ["nom"], context: null, replicaSet: null,
            } }
        )).rejects.toThrow("audit unavailable");

        expect(transactionSession.endSession).toHaveBeenCalledTimes(1);
    });

    it("uses the same transaction boundary for archive and restore receipts", async () => {
        PatientModel.findOneAndUpdate
            .mockResolvedValueOnce({ _id: "patient-archive" })
            .mockResolvedValueOnce({ _id: "patient-restore" });
        const audit = {
            action: "PATIENT_ARCHIVE", operation: "UPDATE", verificationId: "WRV-ARCHIVE",
            clientMutationId: null, actorUserId: "user-1", actorUsername: "doctor.one",
            actorRole: "MEDECIN", ip: null, requestId: "request-1", instanceId: "instance-1",
            requestPath: "/api/patients/:id", changedFields: ["archivedAt"], context: null, replicaSet: null,
        };

        await archivePatientWithWriteVerification(
            "507f1f77bcf86cd799439012", "Doublon confirmé",
            { userId: "user-1", role: "MEDECIN" }, { audit }
        );
        await restorePatientWithWriteVerification(
            "507f1f77bcf86cd799439012", "Demande administrative",
            { userId: "user-1", role: "MEDECIN" }, { audit: { ...audit, action: "PATIENT_RESTORE" } }
        );

        expect(PatientModel.findOneAndUpdate).toHaveBeenCalledWith(
            expect.any(Object), expect.any(Object), expect.objectContaining({ session: transactionSession })
        );
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            collectionName: "patients",
            session: transactionSession,
            throwOnError: true,
        }));
        expect(transactionSession.withTransaction).toHaveBeenCalledTimes(2);
    });

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
        const select = vi.fn();
        patientFind.mockReturnValue({
            select: select.mockReturnValue({
                sort: vi.fn().mockReturnValue({
                    skip: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            lean: vi.fn().mockResolvedValue([]),
                        }),
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
        expect(select).toHaveBeenCalledWith(
            "_id nom prenom num_assurance_maladie addresse telephone archivedAt"
        );
    });

    it("does not let an operational admin query another doctor's patients", async () => {
        patientCountDocuments.mockResolvedValue(0);
        patientFind.mockReturnValue(patientListQuery());

        await listPatients(
            {},
            {},
            { userId: "507f1f77bcf86cd799439099", role: "ADMIN" }
        );

        expect(patientFind).toHaveBeenCalledWith({
            ownerUserId: "507f1f77bcf86cd799439099",
            archivedAt: null,
        });
    });

    it("lists archived dossiers only when explicitly requested", async () => {
        patientCountDocuments.mockResolvedValue(0);
        patientFind.mockReturnValue(patientListQuery());

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
        patientFind.mockReturnValue(
            patientListQuery([{ _id: "patient-1", prenom: "Pierre", nom: "Lasante" }])
        );

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
        patientFind.mockReturnValue(patientListQuery());

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
        patientFind.mockReturnValue(patientListQuery());

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
        patientFind.mockReturnValue(patientListQuery());

        await listPatients(
            { nom: "a".repeat(120) },
            {},
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(
            patientFind.mock.calls[0][0].nomSearch.$regex.source
        ).toHaveLength(81);
    });

    it("never returns clinical profiles, notes, or documents in a patient list", async () => {
        patientCountDocuments.mockResolvedValue(1);
        patientFind.mockReturnValue(patientListQuery([{
            _id: "patient-safe-list",
            nom: "Doe",
            prenom: "Jane",
            num_assurance_maladie: "RAMQ1234567890",
            addresse: "1 Rue Test",
            telephone: "5145550101",
            archivedAt: null,
            courriel: "jane@example.test",
            documents: [{ title: "rapport-confidentiel.pdf" }],
            secure_request_profile: {
                clinicalNotes: "Note clinique confidentielle",
            },
        }]));

        const result = await listPatients(
            {},
            {},
            { userId: "507f1f77bcf86cd799439011", role: "MEDECIN" }
        );

        expect(result.data).toEqual([{
            _id: "patient-safe-list",
            nom: "Doe",
            prenom: "Jane",
            num_assurance_maladie: "RAMQ1234567890",
            addresse: "1 Rue Test",
            telephone: "5145550101",
            archivedAt: null,
        }]);
        expect(JSON.stringify(result.data)).not.toContain("clinicalNotes");
        expect(JSON.stringify(result.data)).not.toContain("rapport-confidentiel.pdf");
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
