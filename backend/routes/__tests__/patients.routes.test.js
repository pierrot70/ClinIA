import { describe, expect, it, vi, beforeEach } from "vitest";

const {
    createPatient,
    listPatientAuditLogs,
    updatePatient,
    deletePatient,
} = vi.hoisted(() => ({
    createPatient: vi.fn(),
    listPatientAuditLogs: vi.fn(),
    updatePatient: vi.fn(),
    deletePatient: vi.fn(),
}));

const {
    toCreatePatientDTO,
    toUpdatePatientDTO,
} = vi.hoisted(() => ({
    toCreatePatientDTO: vi.fn(),
    toUpdatePatientDTO: vi.fn(),
}));

const { recordPatientAuditEvent } = vi.hoisted(() => ({
    recordPatientAuditEvent: vi.fn(),
}));

vi.mock("../../services/patients.js", () => ({
    createPatient,
    listPatients: vi.fn(),
    listPatientAuditLogs,
    getPatientById: vi.fn(),
    updatePatient,
    deletePatient,
}));

vi.mock("../../dto/patient.dto.js", () => ({
    toCreatePatientDTO,
    toUpdatePatientDTO,
}));

vi.mock("../../audit/patientAudit.js", () => ({
    recordPatientAuditEvent,
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

    return layer.route.stack[0].handle;
}

describe("patients routes audit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        expect(res.status).toHaveBeenCalledWith(201);
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
        updatePatient.mockResolvedValue({ _id: "patient-2", ...dto });

        const req = {
            body: dto,
            params: { id: "patient-2" },
            headers: {
                "x-forwarded-for": "203.0.113.9, 10.0.0.10",
            },
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

        expect(recordPatientAuditEvent).toHaveBeenCalledWith({
            action: "PATIENT_UPDATE",
            outcome: "SUCCESS",
            actorUserId: "user-2",
            actorUsername: "doctor.one",
            actorRole: "MEDECIN",
            ip: "203.0.113.9",
            patientId: "patient-2",
            changedFields: [
                "nom",
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
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("records delete audit without patient identifiers", async () => {
        const handler = getRouteHandler("delete", "/:id");

        deletePatient.mockResolvedValue({ _id: "patient-3" });

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
        };
        const res = makeRes();

        await handler(req, res);

        expect(recordPatientAuditEvent).toHaveBeenCalledWith({
            action: "PATIENT_DELETE",
            outcome: "SUCCESS",
            actorUserId: "user-3",
            actorUsername: "super.admin",
            actorRole: "SUPERADMIN",
            ip: "127.0.0.1",
            patientId: "patient-3",
            changedFields: [],
            requestPath: "/api/patients/patient-3",
            context: null,
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