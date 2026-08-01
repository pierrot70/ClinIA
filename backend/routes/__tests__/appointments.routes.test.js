import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    createAppointmentWithWriteVerification,
    findNearestAvailableAppointment,
    getAvailableSlotSchedule,
    listManualAppointmentOptions,
    listAppointmentsPaginated,
    updateAppointmentStatusWithWriteVerification,
} = vi.hoisted(() => ({
    createAppointmentWithWriteVerification: vi.fn(),
    findNearestAvailableAppointment: vi.fn(),
    getAvailableSlotSchedule: vi.fn(),
    listManualAppointmentOptions: vi.fn(),
    listAppointmentsPaginated: vi.fn(),
    updateAppointmentStatusWithWriteVerification: vi.fn(),
}));

const { toCreateAppointmentDTO } = vi.hoisted(() => ({
    toCreateAppointmentDTO: vi.fn(),
}));

const { getReplicaSetStatus } = vi.hoisted(() => ({
    getReplicaSetStatus: vi.fn(),
}));

vi.mock("../../services/appointments.js", () => ({
    createAppointmentWithWriteVerification,
    findNearestAvailableAppointment,
    getAvailableSlotSchedule,
    listManualAppointmentOptions,
    getAppointmentById: vi.fn(),
    cancelAppointmentWithWriteVerification: vi.fn(),
    updateAppointmentStatusWithWriteVerification,
    updateAppointmentScheduleWithWriteVerification: vi.fn(),
    listAppointmentsPaginated,
}));

vi.mock("../../dto/appointment.dto.js", () => ({
    toCreateAppointmentDTO,
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

    it("passes the authenticated patient context when listing available slots", async () => {
        const handler = getRouteHandler("get", "/slots");
        const req = {
            query: {
                specialist: "specialist-1",
                date: "2026-08-03",
                patient: "patient-1",
            },
            auth: {
                userId: "doctor-1",
                role: "MEDECIN",
            },
        };
        const res = makeRes();

        getAvailableSlotSchedule.mockResolvedValue({
            slots: ["12:45"],
            existingAppointmentTimes: ["12:30"],
            maximumAppointmentsReached: false,
        });

        await handler(req, res);

        expect(getAvailableSlotSchedule).toHaveBeenCalledWith(
            "specialist-1",
            "2026-08-03",
            { patient: "patient-1", authUser: req.auth }
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    slots: ["12:45"],
                    existingAppointmentTimes: ["12:30"],
                }),
            })
        );
    });

    it("returns the nearest available appointment recommendation", async () => {
        const handler = getRouteHandler("get", "/recommendation");
        const req = {
            query: { patient: "patient-1", specialty: "Cardiologue" },
            auth: { userId: "doctor-1", role: "MEDECIN" },
        };
        const res = makeRes();
        const recommendation = {
            clinique: { _id: "clinic-1", nom: "Clinique proche", distanceKm: 1.2 },
            specialist: { _id: "specialist-1", nom: "Proche", prenom: "Sara" },
            date: "2026-08-03",
            time: "09:00",
            availableSlots: ["09:00"],
            existingAppointmentTimes: [],
        };
        findNearestAvailableAppointment.mockResolvedValue(recommendation);

        await handler(req, res);

        expect(findNearestAvailableAppointment).toHaveBeenCalledWith(
            { patientId: "patient-1", specialty: "Cardiologue" },
            req.auth
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: recommendation })
        );
    });

    it("returns specialty-filtered manual assignment options", async () => {
        const handler = getRouteHandler("get", "/manual-options");
        const req = { query: { specialty: "Cardiologue" } };
        const res = makeRes();
        const options = {
            cliniques: [{ _id: "clinic-1", nom: "Clinique proche" }],
            specialists: [{ _id: "specialist-1", nom: "Proche", prenom: "Sara" }],
        };
        listManualAppointmentOptions.mockResolvedValue(options);

        await handler(req, res);

        expect(listManualAppointmentOptions).toHaveBeenCalledWith({
            specialty: "Cardiologue",
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: options })
        );
    });

    it("filters the appointment list by a validated clinic identifier", async () => {
        const handler = getRouteHandler("get", "/");
        const clinique = "507f1f77bcf86cd799439021";
        const req = {
            query: { clinique, page: "2", limit: "10", sortDirection: "desc" },
            auth: { userId: "doctor-1", role: "MEDECIN" },
        };
        const res = makeRes();
        listAppointmentsPaginated.mockResolvedValue({
            data: [],
            meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
        });

        await handler(req, res);

        expect(listAppointmentsPaginated).toHaveBeenCalledWith({
            clinique,
            page: 2,
            limit: 10,
            sortDirection: "desc",
            authUser: req.auth,
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns a write verification receipt on appointment creation", async () => {
        const handler = getRouteHandler("post", "/");
        const dto = {
            patient: "patient-1",
            specialist: "specialist-1",
            clinique: "clinique-1",
            date: "2026-07-20",
            time: "09:00",
            priority: "normal",
        };
        const appointment = { _id: "appointment-1", ...dto };

        toCreateAppointmentDTO.mockReturnValue(dto);
        createAppointmentWithWriteVerification.mockResolvedValue({
            appointment,
            writeAuditRecorded: true,
        });

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

        expect(createAppointmentWithWriteVerification).toHaveBeenCalledWith(dto, req.auth, {
            verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
            clientMutationId: "appointment-create-client-1",
            actorUserId: "user-1",
            actorUsername: "doctor.one",
            actorRole: "MEDECIN",
            ip: "10.0.0.10",
            requestId: "request-appointment-create",
            instanceId: "instance-a",
            changedFields: ["patient", "specialist", "clinique", "date", "time", "priority"],
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

    it("returns a conflict when MongoDB rejects a concurrent same-patient booking", async () => {
        const handler = getRouteHandler("post", "/");
        const dto = {
            patient: "patient-1",
            specialist: "specialist-2",
            date: "2026-08-03",
            time: "12:45",
            priority: "normal",
        };
        toCreateAppointmentDTO.mockReturnValue(dto);
        createAppointmentWithWriteVerification.mockRejectedValue({
            code: "PATIENT_ALREADY_BOOKED",
            message:
                "Ce patient a déjà un rendez-vous planifié à cette date et cette heure.",
        });
        const req = {
            body: dto,
            headers: {},
            auth: { userId: "doctor-1", role: "MEDECIN" },
            originalUrl: "/api/appointments",
            requestContext: { requestId: "request-race", instanceId: "instance-a" },
        };
        const res = makeRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "PATIENT_ALREADY_BOOKED",
                message:
                    "Ce patient a déjà un rendez-vous planifié à cette date et cette heure.",
                retryable: false,
            },
        });
    });

    it("returns a conflict when a specialist slot was just booked", async () => {
        const handler = getRouteHandler("post", "/");
        const dto = {
            patient: "patient-2",
            specialist: "specialist-2",
            date: "2026-08-03",
            time: "12:45",
            priority: "normal",
        };
        toCreateAppointmentDTO.mockReturnValue(dto);
        createAppointmentWithWriteVerification.mockRejectedValue({
            code: "SPECIALIST_ALREADY_BOOKED",
            message: "Ce créneau est déjà réservé pour ce spécialiste.",
        });
        const req = {
            body: dto,
            headers: {},
            auth: { userId: "doctor-2", role: "MEDECIN" },
            originalUrl: "/api/appointments",
            requestContext: { requestId: "request-specialist-race", instanceId: "instance-a" },
        };
        const res = makeRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "SPECIALIST_ALREADY_BOOKED",
                message: "Ce créneau est déjà réservé pour ce spécialiste.",
                retryable: false,
            },
        });
    });

    it("returns a write verification receipt on appointment status update", async () => {
        const handler = getRouteHandler("patch", "/:id/status");
        const appointment = {
            _id: "appointment-2",
            status: "completed",
        };

        updateAppointmentStatusWithWriteVerification.mockResolvedValue({
            appointment,
            writeAuditRecorded: true,
        });

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

        expect(updateAppointmentStatusWithWriteVerification).toHaveBeenCalledWith(
            "appointment-2",
            "completed",
            req.auth,
            expect.objectContaining({
                verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                clientMutationId: "appointment-status-client-1",
                ip: "10.0.0.10",
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
