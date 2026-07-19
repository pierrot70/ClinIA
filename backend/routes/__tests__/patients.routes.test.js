import { describe, expect, it, vi, beforeEach } from "vitest";

const {
    createPatient,
    listPatientAuditLogs,
    getPatientById,
    updatePatient,
    archivePatient,
    restorePatient,
} = vi.hoisted(() => ({
    createPatient: vi.fn(),
    listPatientAuditLogs: vi.fn(),
    getPatientById: vi.fn(),
    updatePatient: vi.fn(),
    archivePatient: vi.fn(),
    restorePatient: vi.fn(),
}));

const {
    toCreatePatientDTO,
    toArchivePatientDTO,
    toRestorePatientDTO,
    toUpdatePatientDTO,
} = vi.hoisted(() => ({
    toCreatePatientDTO: vi.fn(),
    toArchivePatientDTO: vi.fn(),
    toRestorePatientDTO: vi.fn(),
    toUpdatePatientDTO: vi.fn(),
}));

const { recordPatientAuditEvent } = vi.hoisted(() => ({
    recordPatientAuditEvent: vi.fn(),
}));

const { recordWriteOperationAuditEvent } = vi.hoisted(() => ({
    recordWriteOperationAuditEvent: vi.fn(),
}));

const { getReplicaSetStatus } = vi.hoisted(() => ({
    getReplicaSetStatus: vi.fn(),
}));

vi.mock("../../services/patients.js", () => ({
    createPatient,
    listPatients: vi.fn(),
    listPatientAuditLogs,
    getPatientById,
    updatePatient,
    archivePatient,
    restorePatient,
}));

vi.mock("../../dto/patient.dto.js", () => ({
    toCreatePatientDTO,
    toArchivePatientDTO,
    toRestorePatientDTO,
    toUpdatePatientDTO,
}));

vi.mock("../../audit/patientAudit.js", () => ({
    recordPatientAuditEvent,
}));

vi.mock("../../audit/writeOperationAudit.js", () => ({
    recordWriteOperationAuditEvent,
}));

vi.mock("../../services/dbStatus.js", () => ({
    getReplicaSetStatus,
}));

import router from "../patients.js";

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

function getRouteHandler(method, path) {
    const layer = router.stack.find(
        (entry) =>
            entry.route?.path === path &&
            entry.route?.methods?.[method] === true
    );

    if (!layer) {
        throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
    }

    return layer.route.stack.at(-1).handle;
}

describe("patients routes audit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getReplicaSetStatus.mockResolvedValue({
            summary: {
                status: "OK",
                memberCount: 3,
                healthyCount: 3,
                primaryCount: 1,
                secondaryCount: 2,
                majorityAvailable: true,
                maxLagSeconds: 0,
                laggingThresholdSeconds: 10,
            },
        });
        recordWriteOperationAuditEvent.mockResolvedValue(true);
    });

    it("records audit data on patient creation", async () => {
        const handler = getRouteHandler("post", "/");
        const dto = { nom: "Doe", prenom: "Jane" };
        const patient = { _id: "patient-1", ...dto };

        toCreatePatientDTO.mockReturnValue(dto);
        createPatient.mockResolvedValue(patient);

        const req = {
            body: dto,
            headers: {},
            auth: {
                userId: "user-1",
                username: "admin.user",
                role: "ADMIN",
            },
            ip: "10.0.0.10",
            originalUrl: "/api/patients",
            requestContext: {
                requestId: "request-create",
                instanceId: "instance-a",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(recordPatientAuditEvent).toHaveBeenCalledWith({
            action: "PATIENT_CREATE",
            outcome: "SUCCESS",
            actorUserId: "user-1",
            actorUsername: "admin.user",
            actorRole: "ADMIN",
            ip: "10.0.0.10",
            patientId: "patient-1",
            changedFields: ["nom", "prenom"],
            requestPath: "/api/patients",
            context: null,
        });
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith({
            collectionName: "patients",
            operation: "CREATE",
            outcome: "SUCCESS",
            verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
            clientMutationId: null,
            actorUserId: "user-1",
            actorUsername: "admin.user",
            actorRole: "ADMIN",
            ip: "10.0.0.10",
            requestId: "request-create",
            instanceId: "instance-a",
            resourceId: "patient-1",
            patientId: "patient-1",
            changedFields: ["nom", "prenom"],
            requestPath: "/api/patients",
            writeConcern: {
                w: "majority",
                j: true,
                wtimeout: 5000,
            },
            replicaSet: {
                summary: {
                    status: "OK",
                    memberCount: 3,
                    healthyCount: 3,
                    primaryCount: 1,
                    secondaryCount: 2,
                    majorityAvailable: true,
                    maxLagSeconds: 0,
                    laggingThresholdSeconds: 10,
                },
            },
        });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: patient,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification: {
                    status: "CONFIRMED",
                    verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                    clientMutationId: null,
                },
            },
        });
    });

    it("returns a telephone-specific conflict message on patient creation", async () => {
        const handler = getRouteHandler("post", "/");
        const dto = {
            nom: "Doe",
            prenom: "Jane",
            telephone: "5145550101",
        };

        toCreatePatientDTO.mockReturnValue(dto);
        createPatient.mockRejectedValue({
            code: 11000,
            keyPattern: { telephone: 1 },
        });

        const req = {
            body: dto,
            headers: {},
            auth: {
                userId: "user-1",
                username: "doctor.one",
                role: "MEDECIN",
            },
            ip: "10.0.0.10",
            originalUrl: "/api/patients",
        };
        const res = makeRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "PATIENT_CONFLICT",
                message: "Ce numéro de téléphone existe déjà.",
                retryable: false,
            },
        });
        expect(recordPatientAuditEvent).not.toHaveBeenCalled();
        expect(recordWriteOperationAuditEvent).not.toHaveBeenCalled();
    });

    it("requires an explicit confirmation when a patient may be an accidental duplicate", async () => {
        const handler = getRouteHandler("post", "/");
        const dto = { nom: "Spenard", prenom: "Mickey" };
        toCreatePatientDTO.mockReturnValue(dto);
        createPatient.mockRejectedValue({
            code: "POTENTIAL_DUPLICATE",
            message: "Un patient avec le même nom et prénom existe déjà.",
        });

        const req = {
            body: dto,
            get: vi.fn().mockReturnValue(undefined),
            headers: {},
            auth: { userId: "user-1", username: "doctor.one", role: "MEDECIN" },
            ip: "10.0.0.10",
            originalUrl: "/api/patients",
        };
        const res = makeRes();

        await handler(req, res);

        expect(createPatient).toHaveBeenCalledWith(dto, req.auth, {
            allowPotentialDuplicate: false,
        });
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "POTENTIAL_DUPLICATE",
                message: "Un patient avec le même nom et prénom existe déjà.",
                retryable: false,
                action: "CONFIRM_POTENTIAL_DUPLICATE",
            },
        });
    });

    it("returns a RAMQ-specific conflict message on patient update", async () => {
        const handler = getRouteHandler("patch", "/:id");
        const dto = {
            num_assurance_maladie: "RAMQ1234567890",
        };

        toUpdatePatientDTO.mockReturnValue(dto);
        updatePatient.mockRejectedValue({
            code: 11000,
            keyValue: { num_assurance_maladie: "RAMQ1234567890" },
        });

        const req = {
            body: dto,
            params: { id: "patient-2" },
            headers: {},
            auth: {
                userId: "user-2",
                username: "doctor.one",
                role: "MEDECIN",
            },
            ip: "10.0.0.10",
            originalUrl: "/api/patients/patient-2",
        };
        const res = makeRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "PATIENT_CONFLICT",
                message:
                    "Ce numéro d'assurance maladie existe déjà.",
                retryable: false,
            },
        });
        expect(recordPatientAuditEvent).not.toHaveBeenCalled();
        expect(recordWriteOperationAuditEvent).not.toHaveBeenCalled();
    });

    it("records changed fields on patient update", async () => {
        const handler = getRouteHandler("patch", "/:id");
        const dto = {
            nom: "Doe",
            prenom: "Janet",
            secure_request_profile: {
                objective: "Traitement initial",
                clinicalScope: "Oncologie",
                selected_document_ids: ["doc-1", "doc-2"],
            },
        };

        toUpdatePatientDTO.mockReturnValue(dto);
        getPatientById.mockResolvedValue({
            _id: "patient-2",
            nom: "Doe",
            prenom: "Jane",
            secure_request_profile: null,
        });
        updatePatient.mockResolvedValue({ _id: "patient-2", ...dto });

        const req = {
            body: dto,
            params: { id: "patient-2" },
            headers: {
                "x-forwarded-for": "203.0.113.9, 10.0.0.10",
                "x-client-mutation-id": "patient-update-client-1",
            },
            auth: {
                userId: "user-2",
                username: "doctor.one",
                role: "MEDECIN",
            },
            ip: "10.0.0.10",
            originalUrl: "/api/patients/patient-2",
            requestContext: {
                requestId: "request-update",
                instanceId: "instance-b",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(recordPatientAuditEvent).toHaveBeenCalledWith({
            action: "PATIENT_UPDATE",
            outcome: "SUCCESS",
            actorUserId: "user-2",
            actorUsername: "doctor.one",
            actorRole: "MEDECIN",
            ip: "203.0.113.9",
            patientId: "patient-2",
            changedFields: [
                "prenom",
                "secure_request_profile",
            ],
            requestPath: "/api/patients/patient-2",
            context: {
                secureRequest: {
                    objective: "Traitement initial",
                    clinicalScope: "Oncologie",
                    selectedDocumentIds: ["doc-1", "doc-2"],
                },
            },
        });
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith({
            collectionName: "patients",
            operation: "UPDATE",
            outcome: "SUCCESS",
            verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
            clientMutationId: "patient-update-client-1",
            actorUserId: "user-2",
            actorUsername: "doctor.one",
            actorRole: "MEDECIN",
            ip: "203.0.113.9",
            requestId: "request-update",
            instanceId: "instance-b",
            resourceId: "patient-2",
            patientId: "patient-2",
            changedFields: [
                "prenom",
                "secure_request_profile",
            ],
            requestPath: "/api/patients/patient-2",
            writeConcern: {
                w: "majority",
                j: true,
                wtimeout: 5000,
            },
            replicaSet: {
                summary: {
                    status: "OK",
                    memberCount: 3,
                    healthyCount: 3,
                    primaryCount: 1,
                    secondaryCount: 2,
                    majorityAvailable: true,
                    maxLagSeconds: 0,
                    laggingThresholdSeconds: 10,
                },
            },
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            data: { _id: "patient-2", ...dto },
            meta: {
                source: "real",
                model: "mongo",
                writeVerification: {
                    status: "CONFIRMED",
                    verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                    clientMutationId: "patient-update-client-1",
                },
            },
        });
    });

    it("records archive audit without patient identifiers", async () => {
        const handler = getRouteHandler("delete", "/:id");

        toArchivePatientDTO.mockReturnValue({ reason: "Doublon confirmé" });
        archivePatient.mockResolvedValue({ _id: "patient-3" });

        const req = {
            params: { id: "patient-3" },
            headers: {},
            auth: {
                userId: "user-3",
                username: "super.admin",
                role: "SUPERADMIN",
            },
            ip: "127.0.0.1",
            originalUrl: "/api/patients/patient-3",
            requestContext: {
                requestId: "request-delete",
                instanceId: "instance-c",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(archivePatient).toHaveBeenCalledWith(
            "patient-3",
            "Doublon confirmé",
            req.auth
        );

        expect(recordPatientAuditEvent).toHaveBeenCalledWith({
            action: "PATIENT_ARCHIVE",
            outcome: "SUCCESS",
            actorUserId: "user-3",
            actorUsername: "super.admin",
            actorRole: "SUPERADMIN",
            ip: "127.0.0.1",
            patientId: "patient-3",
            changedFields: ["archivedAt", "archivedByUserId", "archiveReason"],
            requestPath: "/api/patients/patient-3",
            context: null,
        });
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith({
            collectionName: "patients",
            operation: "UPDATE",
            outcome: "SUCCESS",
            verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
            clientMutationId: null,
            actorUserId: "user-3",
            actorUsername: "super.admin",
            actorRole: "SUPERADMIN",
            ip: "127.0.0.1",
            requestId: "request-delete",
            instanceId: "instance-c",
            resourceId: "patient-3",
            patientId: "patient-3",
            changedFields: ["archivedAt", "archivedByUserId", "archiveReason"],
            requestPath: "/api/patients/patient-3",
            writeConcern: {
                w: "majority",
                j: true,
                wtimeout: 5000,
            },
            replicaSet: {
                summary: {
                    status: "OK",
                    memberCount: 3,
                    healthyCount: 3,
                    primaryCount: 1,
                    secondaryCount: 2,
                    majorityAvailable: true,
                    maxLagSeconds: 0,
                    laggingThresholdSeconds: 10,
                },
            },
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns patient audit logs for admins", async () => {
        const routeLayer = router.stack.find(
            (entry) => entry.route?.path === "/audit-logs"
        );
        const guard = routeLayer.route.stack[0].handle;
        const handler = routeLayer.route.stack[1].handle;

        listPatientAuditLogs.mockResolvedValue({
            logs: [
                {
                    id: "audit-1",
                    action: "PATIENT_CREATE",
                    outcome: "SUCCESS",
                    actorUserId: "507f1f77bcf86cd799439011",
                    actorUsernameMasked: "ad***",
                    actorRole: "ADMIN",
                    ip: "127.0.0.1",
                    patientId: "507f1f77bcf86cd799439012",
                    changedFields: ["nom", "prenom"],
                    requestPath: "/api/patients",
                    timestamp: new Date("2026-04-04T10:00:00.000Z"),
                },
            ],
            pagination: {
                page: 1,
                limit: 20,
                total: 1,
                totalPages: 1,
            },
        });

        const req = {
            query: {
                page: "1",
                limit: "20",
                action: "PATIENT_CREATE",
            },
            auth: {
                userId: "user-1",
                username: "admin.user",
                role: "ADMIN",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        guard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);

        await handler(req, res);

        expect(listPatientAuditLogs).toHaveBeenCalledWith({
            authUser: req.auth,
            page: "1",
            limit: "20",
            action: "PATIENT_CREATE",
            patientId: undefined,
            actorUserId: undefined,
            startDate: undefined,
            endDate: undefined,
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("rejects patient audit logs for non-admin roles", () => {
        const routeLayer = router.stack.find(
            (entry) => entry.route?.path === "/audit-logs"
        );
        const guard = routeLayer.route.stack[0].handle;

        const req = {
            auth: {
                userId: "user-4",
                username: "basic.user",
                role: "USER",
            },
        };
        const res = makeRes();
        const next = vi.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
        });
    });

    it("records a restore audit without retaining its reason", async () => {
        const handler = getRouteHandler("post", "/:id/restore");

        toRestorePatientDTO.mockReturnValue({ reason: "Demande administrative" });
        restorePatient.mockResolvedValue({ _id: "patient-4" });

        const req = {
            params: { id: "patient-4" },
            headers: {},
            auth: {
                userId: "user-4",
                username: "super.admin",
                role: "SUPERADMIN",
            },
            ip: "127.0.0.1",
            originalUrl: "/api/patients/patient-4/restore",
            requestContext: {
                requestId: "request-restore",
                instanceId: "instance-d",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(restorePatient).toHaveBeenCalledWith(
            "patient-4",
            "Demande administrative",
            req.auth
        );
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "PATIENT_RESTORE",
                patientId: "patient-4",
                changedFields: ["archivedAt", "archivedByUserId", "archiveReason"],
                context: null,
            })
        );
        expect(JSON.stringify(recordPatientAuditEvent.mock.calls)).not.toContain(
            "Demande administrative"
        );
    });
