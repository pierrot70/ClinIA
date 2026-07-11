import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    createAppointment,
    updateAppointmentStatus,
} = vi.hoisted(() => ({
    createAppointment: vi.fn(),
    updateAppointmentStatus: vi.fn(),
}));

const { toCreateAppointmentDTO } = vi.hoisted(() => ({
    toCreateAppointmentDTO: vi.fn(),
}));

const { recordWriteOperationAuditEvent } = vi.hoisted(() => ({
    recordWriteOperationAuditEvent: vi.fn(),
}));

const { getReplicaSetStatus } = vi.hoisted(() => ({
    getReplicaSetStatus: vi.fn(),
}));

vi.mock("../../services/appointments.js", () => ({
    createAppointment,
    getAvailableSlots: vi.fn(),
    getAppointmentById: vi.fn(),
    cancelAppointment: vi.fn(),
    updateAppointmentStatus,
    updateAppointmentSchedule: vi.fn(),
    listAppointmentsPaginated: vi.fn(),
}));

vi.mock("../../dto/appointment.dto.js", () => ({
    toCreateAppointmentDTO,
}));

vi.mock("../../audit/writeOperationAudit.js", () => ({
    recordWriteOperationAuditEvent,
}));

vi.mock("../../services/dbStatus.js", () => ({
    getReplicaSetStatus,
}));

import router from "../appointments.js";

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

describe("appointments routes write verification", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        recordWriteOperationAuditEvent.mockResolvedValue(true);
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
    });

    it("returns a write verification receipt on appointment creation", async () => {
        const handler = getRouteHandler("post", "/");
        const dto = {
            patient: "patient-1",
            specialist: "specialist-1",
            date: "2026-07-20",
            time: "09:00",
            priority: "normal",
        };
        const appointment = { _id: "appointment-1", ...dto };

        toCreateAppointmentDTO.mockReturnValue(dto);
        createAppointment.mockResolvedValue(appointment);

        const req = {
            body: dto,
            headers: {
                "x-client-mutation-id": "appointment-create-client-1",
            },
            auth: {
                userId: "user-1",
                username: "doctor.one",
                role: "MEDECIN",
            },
            ip: "10.0.0.10",
            originalUrl: "/api/appointments",
            requestContext: {
                requestId: "request-appointment-create",
                instanceId: "instance-a",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith({
            collectionName: "appointments",
            operation: "CREATE",
            outcome: "SUCCESS",
            verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
            clientMutationId: "appointment-create-client-1",
            actorUserId: "user-1",
            actorUsername: "doctor.one",
            actorRole: "MEDECIN",
            ip: "10.0.0.10",
            requestId: "request-appointment-create",
            instanceId: "instance-a",
            resourceId: "appointment-1",
            patientId: "patient-1",
            changedFields: ["patient", "specialist", "date", "time", "priority"],
            requestPath: "/api/appointments",
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
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification: {
                    status: "CONFIRMED",
                    verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                    clientMutationId: "appointment-create-client-1",
                },
            },
        });
    });

    it("returns a write verification receipt on appointment status update", async () => {
        const handler = getRouteHandler("patch", "/:id/status");
        const appointment = {
            _id: "appointment-2",
            status: "completed",
        };

        updateAppointmentStatus.mockResolvedValue(appointment);

        const req = {
            params: { id: "appointment-2" },
            body: { status: "completed" },
            headers: {
                "x-forwarded-for": "203.0.113.15, 10.0.0.10",
                "x-client-mutation-id": "appointment-status-client-1",
            },
            auth: {
                userId: "user-2",
                username: "doctor.two",
                role: "MEDECIN",
            },
            ip: "10.0.0.10",
            originalUrl: "/api/appointments/appointment-2/status",
            requestContext: {
                requestId: "request-appointment-status",
                instanceId: "instance-b",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                collectionName: "appointments",
                operation: "UPDATE",
                outcome: "SUCCESS",
                verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                clientMutationId: "appointment-status-client-1",
                ip: "203.0.113.15",
                resourceId: "appointment-2",
                changedFields: ["status"],
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            data: appointment,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification: {
                    status: "CONFIRMED",
                    verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                    clientMutationId: "appointment-status-client-1",
                },
            },
        });
    });
});
