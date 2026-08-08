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
const specialistFind = vi.fn();
const cliniqueExists = vi.fn();
const cliniqueFind = vi.fn();
const coordinationRequestFindOne = vi.fn();
const coordinationRequestFindOneAndUpdate = vi.fn();
const coordinationRequestSave = vi.fn();
const recordWriteOperationAuditEvent = vi.fn();
const transactionSession = {
    withTransaction: vi.fn(async (callback) => callback()),
    endSession: vi.fn(),
};

vi.mock("../../models/Appointment.js", () => {
    function Appointment(payload) {
        Object.assign(this, payload);
        this._id ||= "507f1f77bcf86cd799439077";
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
    Specialist: { findById: specialistFindById, find: specialistFind },
}));

vi.mock("../../models/Clinique.js", () => ({
    Clinique: { exists: cliniqueExists, find: cliniqueFind },
}));

vi.mock("../../models/AppointmentCoordinationRequest.js", () => {
    function AppointmentCoordinationRequest(payload) {
        Object.assign(this, payload);
        this.save = coordinationRequestSave;
    }

    AppointmentCoordinationRequest.findOne = coordinationRequestFindOne;
    AppointmentCoordinationRequest.findOneAndUpdate = coordinationRequestFindOneAndUpdate;

    return { AppointmentCoordinationRequest };
});

vi.mock("../../audit/writeOperationAudit.js", () => ({
    recordWriteOperationAuditEvent,
}));

const {
    cancelAppointment,
    cancelAppointmentWithWriteVerification,
    createAppointment,
    createAppointmentWithWriteVerification,
    createAppointmentCoordinationRequest,
    findNearestAvailableAppointment,
    getAvailableSlotSchedule,
    getAvailableSlots,
    listManualAppointmentOptions,
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
    appointmentSave.mockImplementation(function saveAppointmentMock() {
        return Promise.resolve(this);
    });
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

    it("scopes a two-clinic specialist's slots to the selected clinic", async () => {
        const specialistId = "507f1f77bcf86cd799439021";
        const clinicA = "507f1f77bcf86cd799439022";
        const clinicB = "507f1f77bcf86cd799439023";
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                practiceLocations: [
                    {
                        clinique: clinicA,
                        disponibilites: [new Date("2099-01-01T10:00:00")],
                    },
                    {
                        clinique: clinicB,
                        disponibilites: [new Date("2099-01-01T11:00:00")],
                    },
                ],
            }),
        });
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

        await expect(
            getAvailableSlots(specialistId, "2099-01-01", { clinique: clinicB })
        ).resolves.toEqual(["11:00"]);
    });

    it("recommends the nearest clinic that has a free specialty appointment", async () => {
        const patientId = "507f1f77bcf86cd799439012";
        const nearbyClinicId = "507f1f77bcf86cd799439021";
        const fartherClinicId = "507f1f77bcf86cd799439022";
        const nearbySpecialistId = "507f1f77bcf86cd799439031";
        const fartherSpecialistId = "507f1f77bcf86cd799439032";

        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: patientId,
                lat: 45.5,
                long: -73.5,
            }),
        });
        specialistFind.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: nearbySpecialistId,
                    nom: "Proche",
                    prenom: "Sara",
                    specialite: "Cardiologue",
                    clinique_associer: nearbyClinicId,
                    disponibilites: [new Date("2099-01-02T10:00:00")],
                },
                {
                    _id: fartherSpecialistId,
                    nom: "Loin",
                    prenom: "Marc",
                    specialite: "Cardiologue",
                    clinique_associer: fartherClinicId,
                    disponibilites: [new Date("2099-01-01T09:00:00")],
                },
            ]),
        });
        cliniqueFind.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                { _id: nearbyClinicId, nom: "Clinique proche", lat: 45.51, long: -73.5 },
                { _id: fartherClinicId, nom: "Clinique loin", lat: 46.5, long: -73.5 },
            ]),
        });
        specialistFindById.mockImplementation((id) => ({
            lean: vi.fn().mockResolvedValue({
                disponibilites:
                    id === nearbySpecialistId
                        ? [new Date("2099-01-02T10:00:00")]
                        : [new Date("2099-01-01T09:00:00")],
            }),
        }));
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

        await expect(
            findNearestAvailableAppointment(
                { patientId, specialty: "Cardiologue" },
                authUser
            )
        ).resolves.toMatchObject({
            status: "AVAILABLE",
            recommendation: {
                clinique: { _id: nearbyClinicId, nom: "Clinique proche" },
                specialist: { _id: nearbySpecialistId },
                date: "2099-01-02",
                time: "10:00",
                availableSlots: ["10:00"],
            },
        });
    });

    it("reports when no specialist is associated with the selected specialty", async () => {
        const patientId = "507f1f77bcf86cd799439012";
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: patientId,
                lat: 45.5,
                long: -73.5,
            }),
        });
        specialistFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

        await expect(
            findNearestAvailableAppointment(
                { patientId, specialty: "Cardiologue" },
                authUser
            )
        ).resolves.toEqual({
            recommendation: null,
            status: "NO_SPECIALISTS_FOR_SPECIALTY",
        });
    });

    it("reports when specialists exist but have no available slot", async () => {
        const patientId = "507f1f77bcf86cd799439012";
        const clinicId = "507f1f77bcf86cd799439021";
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: patientId,
                lat: 45.5,
                long: -73.5,
            }),
        });
        specialistFind.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "507f1f77bcf86cd799439031",
                    nom: "Proche",
                    prenom: "Sara",
                    specialite: "Cardiologue",
                    clinique_associer: clinicId,
                    disponibilites: [],
                },
            ]),
        });
        cliniqueFind.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                { _id: clinicId, nom: "Clinique proche", lat: 45.51, long: -73.5 },
            ]),
        });

        await expect(
            findNearestAvailableAppointment(
                { patientId, specialty: "Cardiologue" },
                authUser
            )
        ).resolves.toEqual({
            recommendation: null,
            status: "NO_AVAILABLE_SLOTS_FOR_SPECIALTY",
        });
    });

    it("creates one open coordination request when no specialist is registered", async () => {
        const patientId = "507f1f77bcf86cd799439012";
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: patientId,
                ownerUserId: authUser.userId,
            }),
        });
        coordinationRequestFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        coordinationRequestSave.mockResolvedValue(undefined);

        await expect(
            createAppointmentCoordinationRequest(
                { patientId, specialty: "Cardiologue" },
                authUser
            )
        ).resolves.toMatchObject({ alreadyOpen: false });

        expect(coordinationRequestSave).toHaveBeenCalledWith(
            expect.objectContaining({
                w: "majority",
                j: true,
            })
        );
        expect(coordinationRequestSave.mock.instances[0]).toMatchObject(
            expect.objectContaining({
                patient: patientId,
                ownerUserId: authUser.userId,
                specialty: "Cardiologue",
                status: "open",
                requestedByUserId: authUser.userId,
            })
        );
    });

    it("reuses an open coordination request instead of creating a duplicate", async () => {
        const patientId = "507f1f77bcf86cd799439012";
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: patientId,
                ownerUserId: authUser.userId,
            }),
        });
        coordinationRequestFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439041",
                patient: patientId,
                specialty: "Cardiologue",
                status: "open",
            }),
        });

        await expect(
            createAppointmentCoordinationRequest(
                { patientId, specialty: "Cardiologue" },
                authUser
            )
        ).resolves.toMatchObject({ alreadyOpen: true });

        expect(coordinationRequestSave).not.toHaveBeenCalled();
    });

    it("lists only clinics and specialists matching a manual specialty selection", async () => {
        const clinicId = "507f1f77bcf86cd799439021";
        const specialistId = "507f1f77bcf86cd799439031";
        specialistFind.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: specialistId,
                    nom: "Proche",
                    prenom: "Sara",
                    specialite: "Cardiologue",
                    clinique_associer: clinicId,
                },
            ]),
        });
        cliniqueFind.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                { _id: clinicId, nom: "Clinique proche" },
            ]),
        });

        await expect(
            listManualAppointmentOptions({ specialty: "Cardiologue" })
        ).resolves.toEqual({
            cliniques: [{ _id: clinicId, nom: "Clinique proche" }],
            specialists: [
                {
                    _id: specialistId,
                    nom: "Proche",
                    prenom: "Sara",
                    specialite: "Cardiologue",
                    clinique_associer: clinicId,
                },
            ],
        });

        expect(specialistFind).toHaveBeenCalledWith({
            specialite: "Cardiologue",
            clinique_associer: { $ne: null },
        });
    });

    it("lists each practice location for a specialist who works at two clinics", async () => {
        const clinicA = "507f1f77bcf86cd799439021";
        const clinicB = "507f1f77bcf86cd799439022";
        const specialistId = "507f1f77bcf86cd799439031";
        specialistFind.mockReturnValue({
            lean: vi.fn().mockResolvedValue([{
                _id: specialistId,
                nom: "Morgan",
                prenom: "Dexter",
                specialite: "Cardiologue",
                clinique_associer: clinicA,
                practiceLocations: [
                    { clinique: clinicA, disponibilites: [] },
                    { clinique: clinicB, disponibilites: [] },
                ],
            }]),
        });
        cliniqueFind.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                { _id: clinicA, nom: "Clinique A" },
                { _id: clinicB, nom: "Clinique B" },
            ]),
        });

        await expect(
            listManualAppointmentOptions({ specialty: "Cardiologue" })
        ).resolves.toEqual({
            cliniques: [
                { _id: clinicA, nom: "Clinique A" },
                { _id: clinicB, nom: "Clinique B" },
            ],
            specialists: [
                {
                    _id: specialistId,
                    nom: "Morgan",
                    prenom: "Dexter",
                    specialite: "Cardiologue",
                    clinique_associer: clinicA,
                },
                {
                    _id: specialistId,
                    nom: "Morgan",
                    prenom: "Dexter",
                    specialite: "Cardiologue",
                    clinique_associer: clinicB,
                },
            ],
        });
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

    it("returns availability in the Quebec scheduling time zone", async () => {
        const specialistId = "507f1f77bcf86cd799439021";
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                practiceLocations: [{
                    clinique: "clinic-1",
                    disponibilites: [new Date("2099-01-01T13:00:00.000Z")],
                }],
            }),
        });
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

        await expect(
            getAvailableSlots(specialistId, "2099-01-01", {
                clinique: "clinic-1",
            })
        ).resolves.toEqual(["08:00"]);
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

    it("résout automatiquement la demande de coordination après un rendez-vous confirmé", async () => {
        const patientId = "507f1f77bcf86cd799439012";
        const specialistId = "507f1f77bcf86cd799439021";
        const clinicId = "507f1f77bcf86cd799439022";
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({ _id: patientId, ownerUserId: authUser.userId }),
        });
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                clinique_associer: clinicId,
                specialite: "Cardiologue",
                disponibilites: [new Date("2099-01-01T12:00:00")],
            }),
        });
        cliniqueExists.mockResolvedValue(true);
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
        coordinationRequestFindOneAndUpdate.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439088",
                patient: patientId,
                status: "resolved",
            }),
        });

        await createAppointmentWithWriteVerification(
            {
                patient: patientId,
                specialist: specialistId,
                clinique: clinicId,
                date: "2099-01-01",
                time: "12:00",
                priority: "normal",
            },
            authUser,
            { verificationId: "WRV-COORDINATION", changedFields: ["patient", "specialist"] }
        );

        expect(coordinationRequestFindOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                patient: patientId,
                specialty: "Cardiologue",
                status: { $in: ["open", "ready_to_schedule"] },
            }),
            expect.objectContaining({
                $set: expect.objectContaining({ status: "resolved" }),
            }),
            expect.objectContaining({ session: transactionSession })
        );
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                collectionName: "appointmentcoordinationrequests",
                operation: "UPDATE",
                resourceId: "507f1f77bcf86cd799439088",
                patientId,
                changedFields: ["resolvedAppointment", "resolvedAt", "status"],
                session: transactionSession,
            })
        );
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
            clinique: "507f1f77bcf86cd799439031",
            date: "2099-01-01",
            time: "10:00",
        });
        findOne.mockResolvedValueOnce(appointment).mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue(null),
        });
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                practiceLocations: [{
                    clinique: "507f1f77bcf86cd799439032",
                    disponibilites: [new Date("2099-01-02T11:15:00")],
                }],
            }),
        });
        find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

        const result = await updateAppointmentSchedule(
            appointment._id,
            {
                date: "2099-01-02",
                time: "11:15",
                clinique: "507f1f77bcf86cd799439032",
            },
            authUser
        );

        expect(result.date).toBe("2099-01-02");
        expect(result.time).toBe("11:15");
        expect(result.clinique).toBe("507f1f77bcf86cd799439032");
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

    it("reports a concurrent same-specialist booking rejected by MongoDB", async () => {
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
            keyPattern: { specialist: 1, date: 1, time: 1 },
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
            code: "SPECIALIST_ALREADY_BOOKED",
            message: "Ce créneau est déjà réservé pour ce spécialiste.",
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
