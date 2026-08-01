import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findOne = vi.fn();
const find = vi.fn();
const countDocuments = vi.fn();
const appointmentSave = vi.fn();
const bookingGuardFindOneAndUpdate = vi.fn();
const bookingGuardUpdateOne = vi.fn();
const patientFindOne = vi.fn();
const patientFind = vi.fn();
const specialistFindById = vi.fn();
const cliniqueExists = vi.fn();
const recordWriteOperationAuditEvent = vi.fn();
const transactionSession = {
    withTransaction: vi.fn(async (callback) => callback()),
    endSession: vi.fn(),
};

vi.mock("../../models/Appointment.js", () => {
    function Appointment(payload) {
        Object.assign(this, payload);
        this.save = appointmentSave;
    }

    Appointment.findOne = findOne;
    Appointment.find = find;
    Appointment.countDocuments = countDocuments;

    return { Appointment };
});

vi.mock("../../models/AppointmentBookingGuard.js", () => ({
    AppointmentBookingGuard: {
        findOneAndUpdate: bookingGuardFindOneAndUpdate,
        updateOne: bookingGuardUpdateOne,
    },
}));

vi.mock("../../models/Patient.js", () => ({
    Patient: { findOne: patientFindOne, find: patientFind },
}));

vi.mock("../../models/Specialist.js", () => ({
    Specialist: { findById: specialistFindById },
}));

vi.mock("../../models/Clinique.js", () => ({
    Clinique: { exists: cliniqueExists },
}));

vi.mock("../../audit/writeOperationAudit.js", () => ({
    recordWriteOperationAuditEvent,
}));

const {
    cancelAppointment,
    cancelAppointmentWithWriteVerification,
    createAppointment,
    getAvailableSlotSchedule,
    getAvailableSlots,
    listAppointmentsPaginated,
    updateAppointmentSchedule,
    updateAppointmentStatus,
} = await import("../appointments.js");

function buildAppointment(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439011",
        specialist: "cardiology",
        date: "2099-01-01",
        time: "10:00",
        status: "scheduled",
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(transactionSession);
    transactionSession.withTransaction.mockImplementation(async (callback) => callback());
    transactionSession.endSession.mockResolvedValue();
    recordWriteOperationAuditEvent.mockResolvedValue(true);
    appointmentSave.mockResolvedValue(undefined);
    bookingGuardFindOneAndUpdate.mockResolvedValue({ scheduledCount: 1 });
    bookingGuardUpdateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe("appointments service", () => {
    const authUser = {
        userId: "507f1f77bcf86cd799439099",
        role: "MEDECIN",
    };

    it("returns only the current page's patient display names", async () => {
        const appointment = {
            _id: "appointment-1",
            patient: "507f1f77bcf86cd799439012",
            date: "2099-01-01",
            time: "10:00",
        };
        const appointmentQuery = {
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([appointment]),
        };
        find.mockReturnValue(appointmentQuery);
        countDocuments.mockResolvedValue(1);
        patientFind.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    { _id: appointment.patient, prenom: "Bailey", nom: "Spenard" },
                ]),
            }),
        });

        await expect(listAppointmentsPaginated({
            page: 1,
            limit: 10,
            authUser,
        })).resolves.toMatchObject({
            data: [{ _id: "appointment-1", patientName: "Bailey Spenard" }],
        });

        expect(patientFind).toHaveBeenCalledWith({
            _id: { $in: [appointment.patient] },
            ownerUserId: authUser.userId,
        });
        expect(appointmentQuery.sort).toHaveBeenCalledWith({ date: 1, time: 1 });
    });

    it("exposes the specialist's configured evening slots", async () => {
        const specialistId = "507f1f77bcf86cd799439021";
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                disponibilites: [
                    new Date("2099-01-01T12:00:00"),
                    new Date("2099-01-01T18:45:00"),
                ],
            }),
        });
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

        await expect(
            getAvailableSlots(specialistId, "2099-01-01")
        ).resolves.toEqual(["12:00", "18:45"]);
    });

    it("only exposes later slots for a patient's second same-day appointment", async () => {
        const specialistId = "507f1f77bcf86cd799439021";
        const patientId = "507f1f77bcf86cd799439012";
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                disponibilites: [
                    new Date("2099-01-01T12:00:00"),
                    new Date("2099-01-01T12:15:00"),
                    new Date("2099-01-01T12:30:00"),
                    new Date("2099-01-01T12:45:00"),
                ],
            }),
        });
        find
            .mockReturnValueOnce({
                lean: vi.fn().mockResolvedValue([{ time: "12:30" }]),
            })
            .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue([]) });

        await expect(
            getAvailableSlots(specialistId, "2099-01-01", {
                patient: patientId,
            })
        ).resolves.toEqual(["12:45"]);
    });

    it("reports the existing patient appointment without exposing another patient's details", async () => {
        const specialistId = "507f1f77bcf86cd799439021";
        const patientId = "507f1f77bcf86cd799439012";
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                disponibilites: [
                    new Date("2099-01-01T12:00:00"),
                    new Date("2099-01-01T12:30:00"),
                    new Date("2099-01-01T12:45:00"),
                ],
            }),
        });
        find
            .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue([{ time: "12:30" }]) })
            .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue([]) });

        await expect(
            getAvailableSlotSchedule(specialistId, "2099-01-01", {
                patient: patientId,
            })
        ).resolves.toEqual({
            slots: ["12:45"],
            existingAppointmentTimes: ["12:30"],
            maximumAppointmentsReached: false,
        });
    });

    it("does not expose a third same-day appointment for a patient and specialist", async () => {
        const specialistId = "507f1f77bcf86cd799439021";
        const patientId = "507f1f77bcf86cd799439012";
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                disponibilites: [new Date("2099-01-01T12:00:00")],
            }),
        });
        find
            .mockReturnValueOnce({
                lean: vi
                    .fn()
                    .mockResolvedValue([{ time: "12:00" }, { time: "12:30" }]),
            });

        await expect(
            getAvailableSlots(specialistId, "2099-01-01", {
                patient: patientId,
            })
        ).resolves.toEqual([]);
    });

    it("annule un rendez-vous", async () => {
        const appointment = buildAppointment();
        findOne.mockResolvedValue(appointment);

        const result = await cancelAppointment(appointment._id, authUser);

        expect(findOne).toHaveBeenCalledWith({
            _id: appointment._id,
            ownerUserId: authUser.userId,
        });
        expect(result.status).toBe("cancelled");
        expect(appointment.save).toHaveBeenCalledTimes(1);
        expect(bookingGuardUpdateOne).toHaveBeenCalledWith(
            expect.objectContaining({
                patient: appointment.patient,
                specialist: appointment.specialist,
                date: appointment.date,
            }),
            { $inc: { scheduledCount: -1 } },
            { session: null }
        );
    });

    it("annule toute la mutation quand le reçu d'écriture échoue", async () => {
        const appointment = buildAppointment({ patient: "patient-atomic" });
        findOne.mockResolvedValue(appointment);
        recordWriteOperationAuditEvent.mockRejectedValueOnce(
            new Error("audit unavailable")
        );

        await expect(
            cancelAppointmentWithWriteVerification(
                appointment._id,
                authUser,
                {
                    verificationId: "WRV-ATOMIC",
                    clientMutationId: "appointment-atomic-1",
                    changedFields: ["status"],
                }
            )
        ).rejects.toThrow("audit unavailable");

        expect(transactionSession.withTransaction).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                writeConcern: expect.objectContaining({ w: "majority" }),
            })
        );
        expect(appointment.save).toHaveBeenCalledWith(
            expect.objectContaining({ session: transactionSession })
        );
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                collectionName: "appointments",
                operation: "DELETE",
                resourceId: appointment._id,
                patientId: "patient-atomic",
                session: transactionSession,
                throwOnError: true,
            })
        );
        expect(transactionSession.endSession).toHaveBeenCalledTimes(1);
    });

    it("marque un rendez-vous comme completed", async () => {
        const appointment = buildAppointment({ status: "scheduled" });
        findOne.mockResolvedValue(appointment);

        const result = await updateAppointmentStatus(
            appointment._id,
            "completed",
            authUser
        );

        expect(result.status).toBe("completed");
        expect(appointment.save).toHaveBeenCalledTimes(1);
        expect(bookingGuardUpdateOne).toHaveBeenCalledTimes(1);
    });

    it("modifie l'horaire d'un rendez-vous", async () => {
        const appointment = buildAppointment({
            specialist: "507f1f77bcf86cd799439021",
            date: "2099-01-01",
            time: "10:00",
        });
        findOne.mockResolvedValueOnce(appointment).mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue(null),
        });
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                disponibilites: [new Date("2099-01-02T11:15:00")],
            }),
        });
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

        const result = await updateAppointmentSchedule(
            appointment._id,
            {
                date: "2099-01-02",
                time: "11:15",
            },
            authUser
        );

        expect(result.date).toBe("2099-01-02");
        expect(result.time).toBe("11:15");
        expect(appointment.save).toHaveBeenCalledTimes(1);
        expect(bookingGuardUpdateOne).toHaveBeenCalledWith(
            expect.objectContaining({ date: "2099-01-01" }),
            { $inc: { scheduledCount: -1 } },
            { session: null }
        );
    });

    it("reports a same-patient schedule race rejected by MongoDB", async () => {
        const appointment = buildAppointment({
            patient: "507f1f77bcf86cd799439012",
            specialist: "507f1f77bcf86cd799439021",
            date: "2099-01-01",
            time: "10:00",
        });
        findOne.mockResolvedValueOnce(appointment).mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue(null),
        });
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                disponibilites: [new Date("2099-01-02T11:15:00")],
            }),
        });
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
        appointment.save.mockRejectedValueOnce({
            code: 11000,
            keyPattern: { patient: 1, date: 1, time: 1 },
        });

        await expect(
            updateAppointmentSchedule(
                appointment._id,
                { date: "2099-01-02", time: "11:15" },
                authUser
            )
        ).rejects.toEqual({
            code: "PATIENT_ALREADY_BOOKED",
            message:
                "Ce patient a déjà un rendez-vous planifié à cette date et cette heure.",
        });
    });

    it("allows admins to access appointments without an owner filter", async () => {
        const appointment = buildAppointment();
        findOne.mockResolvedValue(appointment);

        await cancelAppointment(appointment._id, {
            userId: authUser.userId,
            role: "ADMIN",
        });

        expect(findOne).toHaveBeenCalledWith({
            _id: appointment._id,
        });
    });

    it("rejects a specialist assigned to another clinic", async () => {
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                num_assurance_maladie: "RAMQ1234567890",
                ownerUserId: authUser.userId,
            }),
        });
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                clinique_associer: "507f1f77bcf86cd799439022",
            }),
        });
        cliniqueExists.mockResolvedValue(true);

        await expect(
            createAppointment(
                {
                    patient: "507f1f77bcf86cd799439012",
                    specialist: "507f1f77bcf86cd799439021",
                    clinique: "507f1f77bcf86cd799439023",
                    date: "2099-01-01",
                    time: "10:00",
                    priority: "normal",
                },
                authUser
            )
        ).rejects.toEqual({
            code: "INVALID_INPUT",
            message:
                "Le spécialiste sélectionné n'est pas associé à cette clinique.",
        });
    });

    it("rejects an appointment for an archived patient", async () => {
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                archivedAt: new Date(),
            }),
        });

        await expect(
            createAppointment(
                {
                    patient: "507f1f77bcf86cd799439012",
                    specialist: "507f1f77bcf86cd799439021",
                    date: "2099-01-01",
                    time: "10:00",
                    priority: "normal",
                },
                authUser
            )
        ).rejects.toEqual({
            code: "PATIENT_ARCHIVED",
            message: "Ce dossier patient est archivé. Aucun rendez-vous ne peut y être ajouté.",
        });
    });

    it("reports a concurrent same-patient booking rejected by MongoDB", async () => {
        const patientId = "507f1f77bcf86cd799439012";
        const specialistId = "507f1f77bcf86cd799439021";
        const clinicId = "507f1f77bcf86cd799439022";

        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: patientId,
                ownerUserId: authUser.userId,
            }),
        });
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                clinique_associer: clinicId,
                disponibilites: [new Date("2099-01-01T12:00:00")],
            }),
        });
        cliniqueExists.mockResolvedValue(true);
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
        appointmentSave.mockRejectedValueOnce({
            code: 11000,
            keyPattern: { patient: 1, date: 1, time: 1 },
        });

        await expect(
            createAppointment(
                {
                    patient: patientId,
                    specialist: specialistId,
                    clinique: clinicId,
                    date: "2099-01-01",
                    time: "12:00",
                    priority: "normal",
                },
                authUser
            )
        ).rejects.toEqual({
            code: "PATIENT_ALREADY_BOOKED",
            message:
                "Ce patient a déjà un rendez-vous planifié à cette date et cette heure.",
        });
    });

    it("atomically rejects a concurrent third daily appointment", async () => {
        const patientId = "507f1f77bcf86cd799439012";
        const specialistId = "507f1f77bcf86cd799439021";
        const clinicId = "507f1f77bcf86cd799439022";

        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: patientId,
                num_assurance_maladie: "RAMQ1234567890",
                ownerUserId: authUser.userId,
            }),
        });
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                clinique_associer: clinicId,
                disponibilites: [
                    new Date("2099-01-01T12:00:00"),
                    new Date("2099-01-01T12:15:00"),
                ],
            }),
        });
        cliniqueExists.mockResolvedValue(true);
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
        bookingGuardFindOneAndUpdate
            .mockResolvedValueOnce({ scheduledCount: 2 })
            .mockResolvedValueOnce(null);

        const baseDto = {
            patient: patientId,
            specialist: specialistId,
            clinique: clinicId,
            date: "2099-01-01",
            priority: "normal",
        };

        const results = await Promise.allSettled([
            createAppointment({ ...baseDto, time: "12:00" }, authUser),
            createAppointment({ ...baseDto, time: "12:15" }, authUser),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.find((result) => result.status === "rejected")?.reason).toEqual({
            code: "MAXIMUM_APPOINTMENTS_REACHED",
            message:
                "Ce patient a déjà le nombre maximal de rendez-vous avec ce spécialiste pour cette journée.",
        });
        expect(bookingGuardFindOneAndUpdate).toHaveBeenCalledTimes(2);
        expect(bookingGuardFindOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patient: patientId,
                specialist: specialistId,
                date: "2099-01-01",
                scheduledCount: { $lt: 2 },
            }),
            expect.objectContaining({ $inc: { scheduledCount: 1 } }),
            expect.objectContaining({ upsert: true })
        );
        expect(appointmentSave).toHaveBeenCalledTimes(1);
    });
});
