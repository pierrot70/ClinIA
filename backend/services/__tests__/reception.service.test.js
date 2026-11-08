import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const issueReceptionBookingProof = vi.fn();
const consumeReceptionBookingProof = vi.fn();
const validateReceptionBookingProof = vi.fn();
vi.mock("../receptionBookingProof.js", () => ({ issueReceptionBookingProof, consumeReceptionBookingProof, validateReceptionBookingProof }));
const adminUserFindOne = vi.fn();
const adminUserFind = vi.fn();
const clinicFindOne = vi.fn();
const clinicFind = vi.fn();
const specialistFindOne = vi.fn();
const specialistFind = vi.fn();
const patientFindOne = vi.fn();
const patientFindOneAndUpdate = vi.fn();
const appointmentFind = vi.fn();
const appointmentExists = vi.fn();
const appointmentUpdateOne = vi.fn();
const appointmentFindOneAndUpdate = vi.fn();
const appointmentCount = vi.fn();
const releaseDailyAppointmentCapacity = vi.fn();
const patientExists = vi.fn();
const getAvailableSlotSchedule = vi.fn();
const createAppointment = vi.fn();
const createPatient = vi.fn();
const recordPatientAuditEvent = vi.fn();
const recordWriteOperationAuditEvent = vi.fn();
const transactionSession = {
    withTransaction: vi.fn(async (callback) => callback()),
    endSession: vi.fn(),
};

vi.mock("../../models/AdminUser.js", () => ({
    AdminUser: { findOne: adminUserFindOne, find: adminUserFind },
}));

vi.mock("../../models/Clinique.js", () => ({ Clinique: { findOne: clinicFindOne, find: clinicFind } }));

vi.mock("../../models/Specialist.js", () => ({
    Specialist: { find: specialistFind, findOne: specialistFindOne },
}));

vi.mock("../../models/Patient.js", () => ({
    Patient: { findOne: patientFindOne, findOneAndUpdate: patientFindOneAndUpdate, exists: patientExists },
}));
vi.mock("../../models/Appointment.js", () => ({ Appointment: { find: appointmentFind, exists: appointmentExists, findOneAndUpdate: appointmentFindOneAndUpdate, updateOne: appointmentUpdateOne, countDocuments: appointmentCount } }));

vi.mock("../../audit/patientAudit.js", () => ({ recordPatientAuditEvent }));
vi.mock("../../audit/writeOperationAudit.js", () => ({
    recordWriteOperationAuditEvent,
}));

vi.mock("../appointments.js", () => ({
    getPracticeLocations: (specialist) => specialist.practiceLocations || [],
    getAvailableSlotSchedule,
    createAppointment,
    releaseDailyAppointmentCapacity,
}));

vi.mock("../patients.js", () => ({ createPatient }));

const {
    findReceptionPatientByRamq,
    listWalkInFamilyMedicineOptions,
    createWalkInPatientAndAppointment,
    createWalkInAppointmentForExistingPatient,
    listReceptionHistoricalAppointments,
    recordReceptionHistoricalAttendance,
} = await import("../reception.js");

const receptionId = "507f1f77bcf86cd799439011";
const clinicId = "507f1f77bcf86cd799439012";
const physicianId = "507f1f77bcf86cd799439014";
const specialistId = "507f1f77bcf86cd799439013";

describe("reception appointment replacement", () => {
    const patientId = "507f1f77bcf86cd799439088";
    const oldId = "507f1f77bcf86cd799439090";
    const newId = "507f1f77bcf86cd799439091";
    const authUser = { userId: receptionId, role: "RECEPTION" };
    const args = { clinicId, patientId, specialistId, date: "2030-01-01", time: "09:15", authUser };
    const original = { _id: oldId, date: "2030-01-01", time: "09:00", specialist: specialistId };
    beforeEach(() => {
        patientFindOne.mockReturnValue(resolvedLean({ _id: patientId, nom: "Test", prenom: "Patient" }));
        appointmentFind.mockReturnValue(resolvedLean([original]));
        createAppointment.mockResolvedValue({ _id: newId });
    });
    it("announces an existing appointment immediately at exact patient lookup", async () => {
        const result = await findReceptionPatientByRamq({ clinicId, ramq: "676767", authUser });
        expect(result.existingAppointments).toEqual([{ _id: oldId, date: "2030-01-01", time: "09:00" }]);
        expect(appointmentFind).toHaveBeenCalledWith({ patient: patientId, clinique: clinicId, status: "scheduled", date: { $gte: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } }, expect.anything());
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
    });
    it("refuses an additional booking without explicit replacement", async () => {
        await expect(createWalkInAppointmentForExistingPatient(args)).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        expect(createAppointment).not.toHaveBeenCalled();
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
    });
    it("refuses availability without choosing to replan", async () => {
        await expect(listWalkInFamilyMedicineOptions({ clinicId, patientId, bookingProof: "proof", authUser })).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        expect(getAvailableSlotSchedule).not.toHaveBeenCalled();
    });
    it("keeps the original while searching and excludes its occupied slot from choices", async () => {
        const result = await listWalkInFamilyMedicineOptions({ clinicId, patientId, bookingProof: "proof", authUser, replaceAppointmentId: oldId, now: new Date("2030-01-01T13:00:00Z") });
        expect(result.today[0].slots).toEqual(["09:15"]);
        expect(getAvailableSlotSchedule).toHaveBeenCalledWith(specialistId, "2030-01-01", expect.objectContaining({ excludeAppointmentId: oldId }));
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
        expect(releaseDailyAppointmentCapacity).not.toHaveBeenCalled();
    });
    it("replaces and links both records with audited writes in the same transaction", async () => {
        await createWalkInAppointmentForExistingPatient({ ...args, replaceAppointmentId: oldId });
        expect(patientFindOneAndUpdate).toHaveBeenCalledWith({ _id: patientId, archivedAt: null }, { $inc: { __v: 1 } }, expect.objectContaining({ session: transactionSession }));
        expect(appointmentUpdateOne).toHaveBeenCalledWith({ _id: oldId, patient: patientId, clinique: clinicId, status: "scheduled" }, { $set: { status: "rescheduled" } }, { session: transactionSession });
        expect(releaseDailyAppointmentCapacity).toHaveBeenCalledWith({ patient: patientId, specialist: specialistId, date: original.date, session: transactionSession });
        expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({ time: "09:15" }), authUser, expect.objectContaining({ session: transactionSession, excludeAppointmentId: oldId }));
        expect(appointmentUpdateOne).toHaveBeenCalledWith({ _id: newId }, { $set: { rescheduledFrom: oldId } }, { session: transactionSession });
        expect(appointmentUpdateOne).toHaveBeenCalledWith({ _id: oldId }, { $set: { rescheduledTo: newId } }, { session: transactionSession });
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "UPDATE", resourceId: oldId, session: transactionSession, throwOnError: true }));
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "CREATE", resourceId: newId, session: transactionSession, throwOnError: true }));
    });
    it.each([[], [original, { ...original, _id: newId }], [{ ...original, _id: newId }]].map(pending => ({ pending })))("rejects stale, foreign or ambiguous replacements %#", async ({ pending }) => {
        appointmentFind.mockReturnValue(resolvedLean(pending));
        await expect(createWalkInAppointmentForExistingPatient({ ...args, replaceAppointmentId: oldId })).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
        expect(createAppointment).not.toHaveBeenCalled();
    });
    it("rejects another clinic before any booking change", async () => {
        await expect(createWalkInAppointmentForExistingPatient({ ...args, clinicId: "507f1f77bcf86cd799439099", replaceAppointmentId: oldId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
    });
    it("rejects an unchanged time", async () => {
        await expect(createWalkInAppointmentForExistingPatient({ ...args, time: "09:00", replaceAppointmentId: oldId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
    });
    it("aborts the transaction if the selected slot is taken", async () => {
        createAppointment.mockRejectedValueOnce({ code: "NO_AVAILABILITY" });
        await expect(createWalkInAppointmentForExistingPatient({ ...args, replaceAppointmentId: oldId })).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(transactionSession.withTransaction).toHaveBeenCalled();
        expect(appointmentUpdateOne).toHaveBeenCalledTimes(1);
        expect(transactionSession.endSession).toHaveBeenCalled();
        expect(recordWriteOperationAuditEvent).not.toHaveBeenCalled();
    });
    it("does not create a replacement after a competing cancellation", async () => {
        appointmentUpdateOne.mockResolvedValueOnce({ modifiedCount: 0 });
        await expect(createWalkInAppointmentForExistingPatient({ ...args, replaceAppointmentId: oldId })).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        expect(createAppointment).not.toHaveBeenCalled();
    });
});

function resolvedLean(value) {
    return { lean: vi.fn().mockResolvedValue(value), session: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis() };
}

beforeEach(() => {
    vi.clearAllMocks();
    issueReceptionBookingProof.mockResolvedValue("proof");
    consumeReceptionBookingProof.mockResolvedValue();
    validateReceptionBookingProof.mockResolvedValue();
    appointmentFind.mockReturnValue(resolvedLean([]));
    appointmentExists.mockResolvedValue(null);
    appointmentUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    patientFindOneAndUpdate.mockImplementation(query => patientFindOne(query));
    vi.spyOn(mongoose, "startSession").mockResolvedValue(transactionSession);
    transactionSession.withTransaction.mockImplementation(async (callback) => callback());
    transactionSession.endSession.mockResolvedValue();
    adminUserFindOne.mockImplementation(query => resolvedLean(query.role === "RECEPTION"
        ? { assignedClinics: [clinicId] } : { _id: physicianId }));
    adminUserFind.mockReturnValue(resolvedLean([{ _id: physicianId, role: "MEDECIN" }]));
    clinicFindOne.mockReturnValue(resolvedLean({ _id: clinicId, nom: "Origin synthetic clinic", lat: 45.5, long: -73.6 }));
    clinicFind.mockReturnValue(resolvedLean([{ _id: clinicId, nom: "Origin synthetic clinic", lat: 45.5, long: -73.6 }]));
    specialistFindOne.mockReturnValue(resolvedLean({
        _id: specialistId, accountUserId: physicianId, specialite: "Medecin de famille",
        practiceLocations: [{ clinique: clinicId }],
    }));
    specialistFind.mockReturnValue(resolvedLean([
        {
            _id: "507f1f77bcf86cd799439013",
            accountUserId: physicianId,
            specialite: "Medecin de famille",
            prenom: "Marie",
            nom: "Leroux",
            practiceLocations: [{
                clinique: clinicId,
                disponibilites: [
                    new Date("2030-01-01T14:00:00.000Z"),
                    new Date("2030-01-02T14:00:00.000Z"),
                ],
                walkInDisponibilites: [
                    new Date("2030-01-01T14:00:00.000Z"),
                    new Date("2030-01-02T14:00:00.000Z"),
                ],
            }],
        },
    ]));
    getAvailableSlotSchedule.mockImplementation(async (_specialist, date) => ({
        slots: date === "2030-01-01" ? ["09:00", "09:15"] : ["08:00"],
    }));
    recordPatientAuditEvent.mockResolvedValue(null);
    recordWriteOperationAuditEvent.mockResolvedValue(true);
    patientExists.mockResolvedValue({ _id: "507f1f77bcf86cd799439088" });
});

describe("listWalkInFamilyMedicineOptions", () => {
    it.each([true, false])("prioritizes future urgentologists over same-day family slots (urgent today: %s)", async urgentAvailable => {
        const familyId = "507f1f77bcf86cd799439099";
        const location = { clinique: clinicId, walkInDisponibilites: [new Date("2030-01-01T14:00:00Z"), new Date("2030-01-02T14:00:00Z")] };
        specialistFind.mockReturnValue(resolvedLean([
            { _id: specialistId, accountUserId: physicianId, specialite: "Urgentologue", practiceLocations: [location] },
            { _id: familyId, accountUserId: physicianId, specialite: "Medecin de famille", practiceLocations: [location] },
        ]));
        appointmentCount.mockReturnValue({ session: vi.fn().mockResolvedValue(0) });
        getAvailableSlotSchedule.mockImplementation(async (id, date) => ({ slots: id === specialistId && date === "2030-01-01" && !urgentAvailable ? [] : ["09:00"] }));
        const result = await listWalkInFamilyMedicineOptions({ clinicId, authUser: { userId: receptionId, role: "RECEPTION" }, now: new Date("2030-01-01T13:00:00Z") });
        expect(result.presentation).toBe("priority");
        expect(result.prioritySpecialty).toBe("Urgentologue");
        expect(result.today.map(option => option.specialist._id)).toEqual(urgentAvailable ? [specialistId] : []);
        expect(result.future.map(option => option.specialist._id)).toEqual([specialistId]);
        expect(result.urgentologists.allAtCapacity).toBe(false);
    });
    it.each([19, 20])("includes active urgentologists with walk-in-only slots and reports daily quota %s", async count => {
        specialistFind.mockReturnValue(resolvedLean([{ _id: specialistId, accountUserId: physicianId, specialite: "Urgentologue",
            practiceLocations: [{ clinique: clinicId, disponibilites: [new Date("2030-01-01T15:00:00Z")], walkInDisponibilites: [new Date("2030-01-01T14:00:00Z")] }] }]));
        appointmentCount.mockReturnValue({ session: vi.fn().mockResolvedValue(count) });
        getAvailableSlotSchedule.mockResolvedValue({ slots: count === 20 ? [] : ["09:00"] });
        const result = await listWalkInFamilyMedicineOptions({ clinicId, authUser: { userId: receptionId, role: "RECEPTION" }, now: new Date("2030-01-01T13:00:00Z") });
        expect(result.urgentologists).toEqual({ limit: 20, day: "2030-01-01", allAtCapacity: count === 20 });
        expect(getAvailableSlotSchedule).toHaveBeenCalledWith(specialistId, "2030-01-01", expect.objectContaining({ slotType: "walk_in" }));
        expect(result.today).toHaveLength(count === 20 ? 0 : 1);
        if (count < 20) expect(result.today[0].specialist.specialty).toBe("Urgentologue");
    });
    it("excludes unlinked specialists and accounts that are not active physicians before looking up slots", async () => {
        const location = { clinique: clinicId, walkInDisponibilites: [new Date("2030-01-01T14:00:00Z")] };
        specialistFind.mockReturnValue(resolvedLean([
            { _id: specialistId, accountUserId: physicianId, specialite: "Medecin de famille", practiceLocations: [location] },
            { _id: "507f1f77bcf86cd799439015", practiceLocations: [location] },
            { _id: "507f1f77bcf86cd799439016", accountUserId: "507f1f77bcf86cd799439017", specialite: "Medecin de famille", practiceLocations: [location] },
        ]));
        const result = await listWalkInFamilyMedicineOptions({ clinicId, authUser: { userId: receptionId, role: "RECEPTION" }, now: new Date("2030-01-01T13:00:00Z") });
        expect(result.today.map(option => option.specialist._id)).toEqual([specialistId]);
        expect(adminUserFind).toHaveBeenCalledWith({ _id: { $in: [physicianId, "507f1f77bcf86cd799439017"] }, role: { $in: ["MEDECIN", "IPS"] }, isActive: true }, { _id: 1, role: 1 });
        expect(getAvailableSlotSchedule.mock.calls.every(([id]) => id === specialistId)).toBe(true);
    });

    it("returns no slots when no linked physician account is active", async () => {
        adminUserFind.mockReturnValue(resolvedLean([]));
        await expect(listWalkInFamilyMedicineOptions({ clinicId, authUser: { userId: receptionId, role: "RECEPTION" }, now: new Date("2030-01-01T13:00:00Z") })).resolves.toMatchObject({ presentation: "priority", today: [], future: [], search: { status: "exhausted", radiusKm: 100 } });
        expect(getAvailableSlotSchedule).not.toHaveBeenCalled();
    });
    it("returns same-day and future family-medicine slots without a patient identifier", async () => {
        const result = await listWalkInFamilyMedicineOptions({
            clinicId,
            authUser: { userId: receptionId, role: "RECEPTION" },
            now: new Date("2030-01-01T13:00:00.000Z"),
        });

        expect(result.today).toEqual([
            expect.objectContaining({
                date: "2030-01-01",
                slots: ["09:00", "09:15"],
                specialist: expect.objectContaining({ prenom: "Marie", nom: "Leroux" }),
            }),
        ]);
        expect(result.future).toEqual([
            expect.objectContaining({ date: "2030-01-02", slots: ["08:00"] }),
        ]);
        expect(getAvailableSlotSchedule).toHaveBeenCalledWith(
            "507f1f77bcf86cd799439013",
            "2030-01-01",
            expect.objectContaining({ clinique: clinicId, slotType: "walk_in" })
        );
    });

    it("refuses a clinic that is not assigned to the reception account", async () => {
        await expect(listWalkInFamilyMedicineOptions({
            clinicId: "507f1f77bcf86cd799439099",
            authUser: { userId: receptionId, role: "RECEPTION" },
            now: new Date("2030-01-01T13:00:00.000Z"),
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(specialistFind).not.toHaveBeenCalled();
    });

    it("does not present regular-only slots to a new patient", async () => {
        specialistFind.mockReturnValue(resolvedLean([
            {
                _id: "507f1f77bcf86cd799439013",
                accountUserId: physicianId,
                specialite: "Medecin de famille",
                prenom: "Marie",
                nom: "Leroux",
                practiceLocations: [{
                    clinique: clinicId,
                    disponibilites: [new Date("2030-01-01T14:00:00.000Z")],
                    walkInDisponibilites: [],
                }],
            },
        ]));

        await expect(listWalkInFamilyMedicineOptions({
            clinicId,
            authUser: { userId: receptionId, role: "RECEPTION" },
            now: new Date("2030-01-01T13:00:00.000Z"),
        })).resolves.toMatchObject({ presentation: "priority", today: [], future: [], search: { status: "exhausted", radiusKm: 100 } });
        expect(getAvailableSlotSchedule).not.toHaveBeenCalled();
    });

    it("excludes slots incompatible with an existing patient's schedule", async () => {
        await listWalkInFamilyMedicineOptions({
            clinicId,
            patientId: "507f1f77bcf86cd799439088",
            authUser: { userId: receptionId, role: "RECEPTION" },
            now: new Date("2030-01-01T13:00:00.000Z"),
        });

        expect(patientExists).toHaveBeenCalledWith({
            _id: "507f1f77bcf86cd799439088",
            archivedAt: null,
        });
        expect(getAvailableSlotSchedule).toHaveBeenCalledWith(
            "507f1f77bcf86cd799439013",
            "2030-01-01",
            expect.objectContaining({
                clinique: clinicId,
                patient: "507f1f77bcf86cd799439088",
                slotType: "regular",
            })
        );
        expect(getAvailableSlotSchedule).toHaveBeenCalledWith(
            "507f1f77bcf86cd799439013",
            "2030-01-01",
            expect.objectContaining({
                clinique: clinicId,
                patient: "507f1f77bcf86cd799439088",
                slotType: "walk_in",
            })
        );
    });

    it("offers walk-in capacity to a patient already known to the clinic", async () => {
        specialistFind.mockReturnValue(resolvedLean([
            {
                _id: "507f1f77bcf86cd799439013",
                accountUserId: physicianId,
                specialite: "Medecin de famille",
                prenom: "Marie",
                nom: "Leroux",
                practiceLocations: [{
                    clinique: clinicId,
                    disponibilites: [],
                    walkInDisponibilites: [
                        new Date("2030-01-01T14:00:00.000Z"),
                    ],
                }],
            },
        ]));

        await expect(listWalkInFamilyMedicineOptions({
            clinicId,
            patientId: "507f1f77bcf86cd799439088",
            authUser: { userId: receptionId, role: "RECEPTION" },
            now: new Date("2030-01-01T13:00:00.000Z"),
        })).resolves.toMatchObject({
            today: [expect.objectContaining({
                date: "2030-01-01",
                slots: ["09:00", "09:15"],
            })],
        });
    });

    it("finds an active patient through an exact RAMQ lookup and records a minimized audit event", async () => {
        patientFindOne.mockReturnValue(resolvedLean({
            _id: "507f1f77bcf86cd799439088",
            nom: "Lasante",
            prenom: "Ginger",
        }));

        const patient = await findReceptionPatientByRamq({
            clinicId,
            ramq: "234-567",
            authUser: { userId: receptionId, username: "reception", role: "RECEPTION" },
            audit: { ip: "127.0.0.1" },
        });

        expect(patient).toEqual({
            _id: "507f1f77bcf86cd799439088",
            nom: "Lasante",
            prenom: "Ginger",
            existingAppointments: [],
            bookingProof: "proof",
        });
        expect(patientFindOne).toHaveBeenCalledWith(
            { healthInsuranceNumberSearch: "234567", archivedAt: null },
            { _id: 1, nom: 1, prenom: 1 }
        );
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            action: "RECEPTION_RAMQ_LOOKUP",
            outcome: "SUCCESS",
            patientId: "507f1f77bcf86cd799439088",
        }));
        expect(JSON.stringify(recordPatientAuditEvent.mock.calls)).not.toContain("234567");
    });
});

describe("createWalkInPatientAndAppointment", () => {
    it.each([
        [{ ownerUserId: 1, country: 1, healthInsuranceJurisdiction: 1, healthInsuranceNumberSearch: 1 }, "PATIENT_ALREADY_EXISTS"],
        [{ specialist: 1, date: 1, time: 1 }, 11000],
        [undefined, 11000],
    ])("maps only the patient identity duplicate (%j)", async (keyPattern, expectedCode) => {
        patientExists.mockResolvedValue(null);
        const error = { code: 11000, keyPattern, keyValue: { healthInsuranceNumberSearch: "SENSITIVE_TEST" }, message: "SENSITIVE_TEST" };
        createPatient.mockRejectedValueOnce(error);
        let caught;
        try {
            await createWalkInPatientAndAppointment({ clinicId, specialistId, date: "2030-01-01", time: "09:00",
                patientDto: { nom: "Test", prenom: "Patient", num_assurance_maladie: "123456" },
                authUser: { userId: receptionId, role: "RECEPTION" } });
        } catch (err) { caught = err; }
        expect(caught?.code).toBe(expectedCode);
        if (expectedCode === "PATIENT_ALREADY_EXISTS") expect(JSON.stringify(caught)).not.toContain("SENSITIVE_TEST");
        else expect(caught).toBe(error);
        expect(createAppointment).not.toHaveBeenCalled();
        expect(transactionSession.endSession).toHaveBeenCalled();
    });
    it("creates the patient and the selected walk-in appointment in one transaction", async () => {
        patientExists.mockResolvedValue(null);
        createPatient.mockResolvedValue({
            _id: "507f1f77bcf86cd799439088",
            nom: "Nouveau",
            prenom: "Patient",
        });
        createAppointment.mockResolvedValue({
            _id: "507f1f77bcf86cd799439099",
            date: "2030-01-01",
            time: "09:00",
        });

        await expect(createWalkInPatientAndAppointment({
            clinicId,
            specialistId: "507f1f77bcf86cd799439013",
            date: "2030-01-01",
            time: "09:00",
            patientDto: {
                nom: "Nouveau",
                prenom: "Patient",
                num_assurance_maladie: "123456",
                secure_request_profile: { clinicalNotes: "Forged reception note" },
                ownerUserId: "forged-owner",
            },
            authUser: { userId: receptionId, username: "reception", role: "RECEPTION" },
        })).resolves.toMatchObject({
            patient: { _id: "507f1f77bcf86cd799439088" },
            appointment: { _id: "507f1f77bcf86cd799439099" },
        });

        expect(createPatient).toHaveBeenCalledWith(
            expect.objectContaining({ num_assurance_maladie: "123456" }),
            expect.objectContaining({ userId: receptionId }),
            { session: transactionSession, receivingPhysicianUserId: physicianId }
        );
        expect(createPatient.mock.calls[0][0]).not.toHaveProperty("secure_request_profile");
        expect(createPatient.mock.calls[0][0]).not.toHaveProperty("ownerUserId");
        expect(createAppointment).toHaveBeenCalledWith(
            expect.objectContaining({
                patient: "507f1f77bcf86cd799439088",
                specialist: "507f1f77bcf86cd799439013",
                clinique: clinicId,
                date: "2030-01-01",
                time: "09:00",
                slotType: "walk_in",
            }),
            expect.objectContaining({ userId: receptionId }),
            expect.objectContaining({
                session: transactionSession,
                receivingPhysicianUserId: physicianId,
                patientFromTransaction: expect.objectContaining({
                    _id: "507f1f77bcf86cd799439088",
                }),
            })
        );
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "PATIENT_CREATE",
                changedFields: ["nom", "prenom", "num_assurance_maladie", "ownerUserId"],
                actorUserId: receptionId,
                actorRole: "RECEPTION",
            })
        );
        expect(transactionSession.endSession).toHaveBeenCalledTimes(1);
    });
});

describe("createWalkInAppointmentForExistingPatient", () => {
    it("refuses reservation before patient writes when the lookup proof is invalid", async () => {
        consumeReceptionBookingProof.mockRejectedValueOnce({ code: "RECEPTION_LOOKUP_REQUIRED" });
        await expect(createWalkInAppointmentForExistingPatient({ clinicId, specialistId, patientId: "507f1f77bcf86cd799439088", bookingProof: "forged", authUser: { userId: receptionId } })).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
        expect(patientFindOneAndUpdate).not.toHaveBeenCalled();
        expect(createAppointment).not.toHaveBeenCalled();
        expect(consumeReceptionBookingProof).toHaveBeenCalledWith(expect.objectContaining({ bookingProof: "forged", clinicId, patientId: "507f1f77bcf86cd799439088", session: transactionSession }));
    });
    it("creates a selected slot for an existing patient without creating a second dossier", async () => {
        patientFindOne.mockReturnValue(resolvedLean({
            _id: "507f1f77bcf86cd799439088",
            nom: "Lasante",
            prenom: "Marie",
            ownerUserId: "507f1f77bcf86cd799439077",
        }));
        createAppointment.mockResolvedValue({
            _id: "507f1f77bcf86cd799439099",
            date: "2030-01-01",
            time: "09:00",
        });

        await expect(createWalkInAppointmentForExistingPatient({
            clinicId,
            specialistId: "507f1f77bcf86cd799439013",
            patientId: "507f1f77bcf86cd799439088",
            date: "2030-01-01",
            time: "09:00",
            slotType: "walk_in",
            authUser: { userId: receptionId, username: "reception", role: "RECEPTION" },
        })).resolves.toMatchObject({
            patient: { _id: "507f1f77bcf86cd799439088" },
            appointment: { _id: "507f1f77bcf86cd799439099" },
        });

        expect(createPatient).not.toHaveBeenCalled();
        expect(createAppointment).toHaveBeenCalledWith(
            expect.objectContaining({
                patient: "507f1f77bcf86cd799439088",
                specialist: "507f1f77bcf86cd799439013",
                clinique: clinicId,
                date: "2030-01-01",
                time: "09:00",
                slotType: "walk_in",
            }),
            expect.objectContaining({ userId: receptionId }),
            expect.objectContaining({
                session: transactionSession,
                receivingPhysicianUserId: physicianId,
                patientFromTransaction: expect.objectContaining({
                    _id: "507f1f77bcf86cd799439088",
                    ownerUserId: "507f1f77bcf86cd799439077",
                }),
            })
        );
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                collectionName: "appointments",
                operation: "CREATE",
                patientId: "507f1f77bcf86cd799439088",
            })
        );
    });
});

describe.each([createWalkInPatientAndAppointment, createWalkInAppointmentForExistingPatient])("receiving physician validation for %s", book => {
    const booking = () => ({ clinicId, specialistId, patientId: "507f1f77bcf86cd799439088", date: "2030-01-01", time: "09:00",
        patientDto: { nom: "Test", prenom: "Demo", num_assurance_maladie: "123456" },
        authUser: { userId: receptionId, role: "RECEPTION" } });

    it.each(["unlinked", "inactive-or-missing", "wrong-clinic", "missing-specialist"])("rejects %s before any patient or appointment write", async scenario => {
        patientExists.mockResolvedValue(null);
        if (scenario === "unlinked") specialistFindOne.mockReturnValue(resolvedLean({ _id: specialistId, practiceLocations: [{ clinique: clinicId }] }));
        if (scenario === "inactive-or-missing") adminUserFindOne.mockImplementation(query => resolvedLean(query.role === "RECEPTION" ? { assignedClinics: [clinicId] } : null));
        if (scenario === "wrong-clinic") specialistFindOne.mockReturnValue(resolvedLean({ _id: specialistId, accountUserId: physicianId, practiceLocations: [] }));
        if (scenario === "missing-specialist") specialistFindOne.mockReturnValue(resolvedLean(null));
        await expect(book(booking())).rejects.toMatchObject({ code: scenario === "unlinked" || scenario === "inactive-or-missing" ? "RECEIVING_PHYSICIAN_UNAVAILABLE" : "FORBIDDEN" });
        expect(createPatient).not.toHaveBeenCalled();
        expect(createAppointment).not.toHaveBeenCalled();
        expect(recordPatientAuditEvent).not.toHaveBeenCalled();
        expect(recordWriteOperationAuditEvent).not.toHaveBeenCalled();
        expect(transactionSession.endSession).toHaveBeenCalled();
    });

    it("rechecks account eligibility at booking after valid availability was displayed", async () => {
        await listWalkInFamilyMedicineOptions({ clinicId, authUser: booking().authUser, now: new Date("2030-01-01T13:00:00Z") });
        expect(getAvailableSlotSchedule).toHaveBeenCalled();
        patientExists.mockResolvedValue(null);
        adminUserFindOne.mockImplementation(query => resolvedLean(query.role === "RECEPTION" ? { assignedClinics: [clinicId] } : null));
        await expect(book(booking())).rejects.toMatchObject({ code: "RECEIVING_PHYSICIAN_UNAVAILABLE" });
        expect(adminUserFindOne).toHaveBeenCalledWith({ _id: physicianId, role: "MEDECIN", isActive: true }, { _id: 1 });
        expect(createAppointment).not.toHaveBeenCalled();
    });
});


describe("WalkIn verified receipt transaction", () => {
    const patientId = "507f1f77bcf86cd799439088";
    const appointmentId = "507f1f77bcf86cd799439099";
    const oldId = "507f1f77bcf86cd799439090";
    const authUser = { userId: receptionId, username: "synthetic-reception", role: "RECEPTION" };
    const audit = { verificationId: "WRV-SYNTHETIC-REQUEST", clientMutationId: "synthetic-mutation", requestId: "request-test", instanceId: "instance-test",
        replicaSet: { summary: { status: "OK", memberCount: 3, majorityAvailable: true } } };
    const args = { clinicId, specialistId, patientId, date: "2030-01-01", time: "09:15", authUser, audit,
        patientDto: { nom: "Synthetic", prenom: "Fixture", num_assurance_maladie: "TEST12345678" } };
    beforeEach(() => {
        patientExists.mockResolvedValue(null);
        patientFindOne.mockReturnValue(resolvedLean({ _id: patientId, nom: "Synthetic", prenom: "Fixture" }));
        createPatient.mockResolvedValue({ _id: patientId, nom: "Synthetic", prenom: "Fixture" });
        createAppointment.mockResolvedValue({ _id: appointmentId });
    });

    it.each([createWalkInPatientAndAppointment, createWalkInAppointmentForExistingPatient])("returns a verified audit flag after successful commit for %s", async book => {
        const result = await book(args);
        expect(result.writeAuditRecorded).toBe(true);
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            verificationId: audit.verificationId, clientMutationId: audit.clientMutationId, replicaSet: audit.replicaSet,
            actorUserId: receptionId, actorRole: "RECEPTION", collectionName: "appointments", operation: "CREATE",
            writeConcern: { w: "majority", j: true, wtimeout: 5000 }, session: transactionSession, throwOnError: true,
        }));
    });

    it("uses the same request receipt context for both old UPDATE and new CREATE on replacement", async () => {
        appointmentFind.mockReturnValue(resolvedLean([{ _id: oldId, date: "2030-01-01", time: "09:00", specialist: specialistId }]));
        const result = await createWalkInAppointmentForExistingPatient({ ...args, replaceAppointmentId: oldId });
        expect(result.writeAuditRecorded).toBe(true);
        const events = recordWriteOperationAuditEvent.mock.calls.map(([event]) => event);
        expect(events).toHaveLength(2);
        expect(events.map(event => [event.operation, event.resourceId])).toEqual([["UPDATE", oldId], ["CREATE", appointmentId]]);
        events.forEach(event => expect(event).toMatchObject({ verificationId: audit.verificationId, clientMutationId: audit.clientMutationId,
            requestId: audit.requestId, instanceId: audit.instanceId, replicaSet: audit.replicaSet,
            actorUserId: receptionId, session: transactionSession, throwOnError: true }));
    });

    it.each([createWalkInPatientAndAppointment, createWalkInAppointmentForExistingPatient])("propagates required audit failure from %s without returning confirmation", async book => {
        recordWriteOperationAuditEvent.mockRejectedValueOnce(new Error("Synthetic audit insert failure"));
        await expect(book(args)).rejects.toThrow("Synthetic audit insert failure");
        expect(transactionSession.withTransaction).toHaveBeenCalledWith(expect.any(Function), { writeConcern: { w: "majority", j: true, wtimeout: 5000 } });
        expect(transactionSession.endSession).toHaveBeenCalled();
    });

    it.each([createWalkInPatientAndAppointment, createWalkInAppointmentForExistingPatient])("does not return success if the transaction commit fails in %s", async book => {
        transactionSession.withTransaction.mockImplementationOnce(async callback => { await callback(); throw new Error("Synthetic commit failure"); });
        await expect(book(args)).rejects.toThrow("Synthetic commit failure");
        expect(transactionSession.endSession).toHaveBeenCalled();
    });

    it("retains one request verification ID when Mongo retries the transaction callback", async () => {
        transactionSession.withTransaction.mockImplementationOnce(async callback => { await callback(); await callback(); });
        await createWalkInAppointmentForExistingPatient(args);
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledTimes(2);
        expect(new Set(recordWriteOperationAuditEvent.mock.calls.map(([event]) => event.verificationId))).toEqual(new Set([audit.verificationId]));
    });
});


describe("reception pending appointments use the clinic calendar day", () => {
    const patientId = "507f1f77bcf86cd799439088";
    const oldId = "507f1f77bcf86cd799439090";
    const newId = "507f1f77bcf86cd799439091";
    const authUser = { userId: receptionId, role: "RECEPTION" };
    const args = { clinicId, patientId, specialistId, date: "2030-01-02", time: "09:15", authUser, bookingProof: "proof" };
    let records;
    const record = (date, extra = {}) => ({ _id: oldId, patient: patientId, clinique: clinicId,
        status: "scheduled", date, time: "08:00", specialist: specialistId, ...extra });
    function matching(query) {
        return records.filter(item => item.patient === query.patient && item.clinique === query.clinique && item.status === query.status &&
            (!query.date?.$gte || item.date >= query.date.$gte) && (!query.date?.$lt || item.date < query.date.$lt) &&
            (!("attendanceResolution" in query) || item.attendanceResolution == null));
    }
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2030-01-02T17:00:00.000Z"));
        getAvailableSlotSchedule.mockResolvedValue({ slots: ["09:15"] });
        records = [record("2030-01-01")];
        patientFindOne.mockReturnValue(resolvedLean({ _id: patientId, nom: "Synthetic", prenom: "Only" }));
        appointmentFind.mockImplementation(query => resolvedLean(matching(query).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)));
        appointmentExists.mockImplementation(async query => matching(query)[0] ? { _id: matching(query)[0]._id } : null);
        createAppointment.mockResolvedValue({ _id: newId });
    });
    afterEach(() => vi.useRealTimers());

    it.each([
        ["2030-01-02T04:59:59.999Z", "2030-01-01"],
        ["2030-01-02T05:00:00.000Z", "2030-01-02"],
        ["2030-07-02T03:59:59.999Z", "2030-07-01"],
        ["2030-07-02T04:00:00.000Z", "2030-07-02"],
    ])("uses Toronto day %s -> %s for lookup and options", async (instant, today) => {
        records = [];
        const now = new Date(instant);
        await findReceptionPatientByRamq({ clinicId, ramq: "TEST0001", authUser, now });
        await listWalkInFamilyMedicineOptions({ clinicId, patientId, bookingProof: "proof", authUser, now });
        expect(appointmentFind).toHaveBeenCalledTimes(2);
        for (const [query] of appointmentFind.mock.calls) expect(query).toEqual({ patient: patientId, clinique: clinicId, status: "scheduled", date: { $gte: today } });
        expect(appointmentExists).toHaveBeenCalledWith({ patient: patientId, clinique: clinicId, status: "scheduled", date: { $lt: today }, attendanceResolution: null });
    });
    it("returns only a historical boolean and permits a new arrival without rewriting two older scheduled records", async () => {
        records.push(record("2029-12-31", { _id: "507f1f77bcf86cd799439092" }));
        const before = structuredClone(records);
        const lookup = await findReceptionPatientByRamq({ clinicId, ramq: "TEST0001", authUser });
        expect(lookup).toEqual({ _id: patientId, nom: "Synthetic", prenom: "Only", bookingProof: "proof", existingAppointments: [], hasHistoricalScheduledAppointments: true });
        const options = await listWalkInFamilyMedicineOptions({ clinicId, patientId, bookingProof: "proof", authUser, now: new Date() });
        expect(options.today).toHaveLength(1);
        const result = await createWalkInAppointmentForExistingPatient({ ...args, audit: { verificationId: "WRV-genuine-request" } });
        expect(result.appointment._id).toBe(newId);
        expect(result.writeAuditRecorded).toBe(true);
        expect(consumeReceptionBookingProof).toHaveBeenCalledWith(expect.objectContaining({ bookingProof: "proof", session: transactionSession }));
        expect(records).toEqual(before);
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
        expect(releaseDailyAppointmentCapacity).not.toHaveBeenCalled();
        expect(createPatient).not.toHaveBeenCalled();
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledTimes(1);
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "CREATE", resourceId: newId, verificationId: "WRV-genuine-request", session: transactionSession, throwOnError: true }));
    });
    it("does not signal old records from another clinic or a non-scheduled status", async () => {
        records = [record("2030-01-01", { clinique: "507f1f77bcf86cd799439099" }), record("2030-01-01", { status: "completed" })];
        const lookup = await findReceptionPatientByRamq({ clinicId, ramq: "TEST0001", authUser });
        expect(lookup.existingAppointments).toEqual([]);
        expect(lookup).not.toHaveProperty("hasHistoricalScheduledAppointments");
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
    });
    it("rejects an old replacement ID both while searching and during the final transaction", async () => {
        await expect(listWalkInFamilyMedicineOptions({ clinicId, patientId, bookingProof: "proof", authUser, replaceAppointmentId: oldId, now: new Date() })).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        await expect(createWalkInAppointmentForExistingPatient({ ...args, replaceAppointmentId: oldId })).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
        expect(createAppointment).not.toHaveBeenCalled();
        expect(recordWriteOperationAuditEvent).not.toHaveBeenCalled();
        expect(records[0].status).toBe("scheduled");
    });
    it.each(["2030-01-02", "2030-01-03"])("retains %s as pending even when today's hour has elapsed", async date => {
        records.push(record(date, { _id: newId, time: "00:01" }));
        const lookup = await findReceptionPatientByRamq({ clinicId, ramq: "TEST0001", authUser });
        expect(lookup.existingAppointments).toEqual([{ _id: newId, date, time: "00:01" }]);
        expect(lookup.hasHistoricalScheduledAppointments).toBe(true);
        await expect(listWalkInFamilyMedicineOptions({ clinicId, patientId, bookingProof: "proof", authUser, now: new Date() })).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        await expect(createWalkInAppointmentForExistingPatient(args)).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
    });
    it("still refuses ambiguous current and future appointments even when the requested replacement matches one", async () => {
        records.push(record("2030-01-02", { _id: newId }), record("2030-01-03", { _id: "507f1f77bcf86cd799439093" }));
        const lookup = await findReceptionPatientByRamq({ clinicId, ramq: "TEST0001", authUser });
        expect(lookup.existingAppointments).toHaveLength(2);
        await expect(listWalkInFamilyMedicineOptions({ clinicId, patientId, bookingProof: "proof", authUser, replaceAppointmentId: newId, now: new Date() })).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        await expect(createWalkInAppointmentForExistingPatient({ ...args, replaceAppointmentId: newId })).rejects.toMatchObject({ code: "RECEPTION_REPLAN_REQUIRED" });
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
    });
    it("recomputes the cutoff after the patient lock on each transaction attempt", async () => {
        records = [];
        vi.setSystemTime(new Date("2030-01-02T04:59:59.999Z"));
        transactionSession.withTransaction.mockImplementationOnce(async callback => {
            await callback();
            vi.setSystemTime(new Date("2030-01-02T05:00:00.000Z"));
            await callback();
        });
        await createWalkInAppointmentForExistingPatient(args);
        expect(appointmentFind.mock.calls.map(([query]) => query.date)).toEqual([{ $gte: "2030-01-01" }, { $gte: "2030-01-02" }]);
        expect(consumeReceptionBookingProof).toHaveBeenCalledTimes(2);
        expect(patientFindOneAndUpdate).toHaveBeenCalledTimes(2);
        const proofCalls = consumeReceptionBookingProof.mock.invocationCallOrder;
        const lockCalls = patientFindOneAndUpdate.mock.invocationCallOrder;
        const pendingCalls = appointmentFind.mock.invocationCallOrder;
        for (let i = 0; i < 2; i++) { expect(proofCalls[i]).toBeLessThan(lockCalls[i]); expect(lockCalls[i]).toBeLessThan(pendingCalls[i]); }
        expect(appointmentFind.mock.results.every(({ value }) => value.session.mock.calls[0][0] === transactionSession)).toBe(true);
    });
    it("does not query appointment history when exact lookup finds no patient", async () => {
        patientFindOne.mockReturnValue(resolvedLean(null));
        expect(await findReceptionPatientByRamq({ clinicId, ramq: "TEST0001", authUser })).toBeNull();
        expect(appointmentFind).not.toHaveBeenCalled();
        expect(appointmentExists).not.toHaveBeenCalled();
        expect(issueReceptionBookingProof).not.toHaveBeenCalled();
    });
});


describe("reception historical attendance is an administrative patient statement", () => {
    const patientId = "507f1f77bcf86cd799439088";
    const appointmentId = "507f1f77bcf86cd799439090";
    const authUser = { userId: receptionId, username: "synthetic-reception", role: "RECEPTION", sessionId: "session-test" };
    const args = { clinicId, patientId, appointmentId, bookingProof: "a".repeat(64), outcome: "attended", authUser,
        audit: { verificationId: "WRV-ATTENDANCE-REQUEST", clientMutationId: "mutation-test", replicaSet: { summary: { status: "INCIDENT" } }, requestId: "request-test" } };
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2030-01-02T17:00:00Z"));
        patientFindOne.mockReturnValue(resolvedLean({ _id: patientId }));
        appointmentFind.mockReturnValue(resolvedLean([{ _id: appointmentId, date: "2030-01-01", time: "08:00", reason: "SYNTHETIC_PRIVATE", ownerUserId: physicianId }]));
        appointmentFindOneAndUpdate.mockImplementation((_query, update) => resolvedLean({ _id: appointmentId, date: "2030-01-01", time: "08:00", status: "scheduled", attendanceResolution: update.$set.attendanceResolution }));
        issueReceptionBookingProof.mockResolvedValue("fresh-proof");
    });
    afterEach(() => vi.useRealTimers());

    it("returns only bounded date/time/id details after exact proof validation without consuming", async () => {
        const result = await listReceptionHistoricalAppointments(args);
        expect(result).toEqual({ appointments: [{ _id: appointmentId, date: "2030-01-01", time: "08:00" }], hasMore: false });
        expect(validateReceptionBookingProof).toHaveBeenCalledExactlyOnceWith({ bookingProof: args.bookingProof, authUser, clinicId, patientId });
        expect(consumeReceptionBookingProof).not.toHaveBeenCalled();
        expect(appointmentFind).toHaveBeenCalledWith({ patient: patientId, clinique: clinicId, status: "scheduled", date: { $lt: "2030-01-02" }, attendanceResolution: null }, { _id: 1, date: 1, time: 1 });
        expect(appointmentFind.mock.results[0].value.limit).toHaveBeenCalledWith(51);
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "RECEPTION_HISTORY_READ", actorUserId: receptionId, patientId, throwOnError: true }));
    });
    it("bounds a long unresolved history and signals remaining records", async () => {
        appointmentFind.mockReturnValue(resolvedLean(Array.from({ length: 51 }, (_, i) => ({ _id: String(i), date: "2029-12-01", time: "08:00" }))));
        const result = await listReceptionHistoricalAppointments(args);
        expect(result.appointments).toHaveLength(50);
        expect(result.hasMore).toBe(true);
    });
    it("rejects an unproven list before patient or appointment reads", async () => {
        validateReceptionBookingProof.mockRejectedValueOnce({ code: "RECEPTION_LOOKUP_REQUIRED" });
        await expect(listReceptionHistoricalAppointments(args)).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
        expect(patientExists).not.toHaveBeenCalled();
        expect(appointmentFind).not.toHaveBeenCalled();
    });
    it.each(["MEDECIN", "ADMIN", "SUPERADMIN", undefined])("rejects %s at the service boundary before DB access", async role => {
        const input = { ...args, authUser: { ...authUser, role } };
        await expect(listReceptionHistoricalAppointments(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(recordReceptionHistoricalAttendance(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(adminUserFindOne).not.toHaveBeenCalled();
        expect(consumeReceptionBookingProof).not.toHaveBeenCalled();
    });
    it.each([{}, [], "bad", null])("rejects malformed patient ID %j before DB access", async patientId => {
        await expect(listReceptionHistoricalAppointments({ ...args, patientId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        await expect(recordReceptionHistoricalAttendance({ ...args, patientId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(adminUserFindOne).not.toHaveBeenCalled();
    });
    it.each([undefined, null, {}, [], "bad"])("rejects a missing or malformed appointment ID %j before DB access", async appointmentId => {
        await expect(recordReceptionHistoricalAttendance({ ...args, appointmentId })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(adminUserFindOne).not.toHaveBeenCalled();
        expect(consumeReceptionBookingProof).not.toHaveBeenCalled();
    });
    it("rejects another clinic before proof or historical reads", async () => {
        const input = { ...args, clinicId: "507f1f77bcf86cd799439099" };
        await expect(listReceptionHistoricalAppointments(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(recordReceptionHistoricalAttendance(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(validateReceptionBookingProof).not.toHaveBeenCalled();
        expect(consumeReceptionBookingProof).not.toHaveBeenCalled();
    });
    it.each(["completed", "no_show", "scheduled", null, {}, []])("rejects unsupported attendance outcome %j without writing", async outcome => {
        await expect(recordReceptionHistoricalAttendance({ ...args, outcome })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(adminUserFindOne).not.toHaveBeenCalled();
        expect(appointmentFindOneAndUpdate).not.toHaveBeenCalled();
    });
    it.each(["attended", "not_attended"])("records %s without clinical closure, ownership or capacity mutation and rotates the proof transactionally", async outcome => {
        const result = await recordReceptionHistoricalAttendance({ ...args, outcome });
        expect(result).toEqual({ appointment: { _id: appointmentId, date: "2030-01-01", time: "08:00", attendanceResolution: { outcome } }, bookingProof: "fresh-proof", writeAuditRecorded: true });
        expect(consumeReceptionBookingProof).toHaveBeenCalledWith(expect.objectContaining({ bookingProof: args.bookingProof, authUser, clinicId, patientId, session: transactionSession }));
        expect(appointmentFindOneAndUpdate).toHaveBeenCalledExactlyOnceWith({ _id: appointmentId, patient: patientId, clinique: clinicId, status: "scheduled", date: { $lt: "2030-01-02" }, attendanceResolution: null },
            { $set: { attendanceResolution: { outcome, recordedAt: new Date(), recordedByUserId: receptionId, source: "patient_statement" } } }, expect.objectContaining({ session: transactionSession, new: true, runValidators: true }));
        expect(issueReceptionBookingProof).toHaveBeenCalledExactlyOnceWith({ authUser, clinicId, patientId, session: transactionSession });
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ verificationId: args.audit.verificationId, replicaSet: args.audit.replicaSet, operation: "UPDATE", resourceId: appointmentId, changedFields: ["attendanceResolution"], session: transactionSession, throwOnError: true }));
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "RECEPTION_ATTENDANCE_UPDATE", changedFields: ["attendanceResolution"], session: transactionSession, throwOnError: true }));
        expect(transactionSession.withTransaction).toHaveBeenCalledWith(expect.any(Function), { writeConcern: { w: "majority", j: true, wtimeout: 5000 } });
        expect(appointmentUpdateOne).not.toHaveBeenCalled();
        expect(releaseDailyAppointmentCapacity).not.toHaveBeenCalled();
        expect(createAppointment).not.toHaveBeenCalled();
    });
    it("rejects a stale, already resolved, current, future or foreign appointment through the same CAS without revealing it", async () => {
        appointmentFindOneAndUpdate.mockReturnValue(resolvedLean(null));
        await expect(recordReceptionHistoricalAttendance(args)).rejects.toMatchObject({ code: "RECEPTION_HISTORY_CONFLICT" });
        expect(recordWriteOperationAuditEvent).not.toHaveBeenCalled();
        expect(issueReceptionBookingProof).not.toHaveBeenCalled();
        expect(transactionSession.endSession).toHaveBeenCalled();
    });
    it("does not mutate after a consumed, expired or wrong-session proof", async () => {
        consumeReceptionBookingProof.mockRejectedValueOnce({ code: "RECEPTION_LOOKUP_REQUIRED" });
        await expect(recordReceptionHistoricalAttendance(args)).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
        expect(patientFindOneAndUpdate).not.toHaveBeenCalled();
        expect(appointmentFindOneAndUpdate).not.toHaveBeenCalled();
    });
    it("rejects an archived or missing patient under the transaction lock", async () => {
        patientFindOne.mockReturnValue(resolvedLean(null));
        await expect(recordReceptionHistoricalAttendance(args)).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(appointmentFindOneAndUpdate).not.toHaveBeenCalled();
        expect(issueReceptionBookingProof).not.toHaveBeenCalled();
    });
    it("does not expose a successful result or issue a fresh proof after a required write audit failure", async () => {
        recordWriteOperationAuditEvent.mockRejectedValueOnce(new Error("synthetic-audit-failure"));
        await expect(recordReceptionHistoricalAttendance(args)).rejects.toThrow("synthetic-audit-failure");
        expect(issueReceptionBookingProof).not.toHaveBeenCalled();
        expect(transactionSession.endSession).toHaveBeenCalled();
    });
    it("returns no list when its mandatory read audit fails", async () => {
        recordPatientAuditEvent.mockRejectedValueOnce(new Error("synthetic-read-audit-failure"));
        await expect(listReceptionHistoricalAppointments(args)).rejects.toThrow("synthetic-read-audit-failure");
    });
    it("recalculates the past-day predicate inside each retry after the proof and patient lock", async () => {
        vi.setSystemTime(new Date("2030-01-02T04:59:59.999Z"));
        transactionSession.withTransaction.mockImplementationOnce(async callback => { await callback(); vi.setSystemTime(new Date("2030-01-02T05:00:00Z")); await callback(); });
        await recordReceptionHistoricalAttendance(args);
        expect(appointmentFindOneAndUpdate.mock.calls.map(([query]) => query.date)).toEqual([{ $lt: "2030-01-01" }, { $lt: "2030-01-02" }]);
        expect(issueReceptionBookingProof).toHaveBeenCalledTimes(2);
        for (let i = 0; i < 2; i++) {
            expect(consumeReceptionBookingProof.mock.invocationCallOrder[i]).toBeLessThan(patientFindOneAndUpdate.mock.invocationCallOrder[i]);
            expect(patientFindOneAndUpdate.mock.invocationCallOrder[i]).toBeLessThan(appointmentFindOneAndUpdate.mock.invocationCallOrder[i]);
        }
        expect(recordWriteOperationAuditEvent.mock.calls.map(([audit]) => audit.verificationId)).toEqual([args.audit.verificationId, args.audit.verificationId]);
    });
    it.each([undefined, null])("omits the historical signal after administrative resolution while including legacy unresolved %j", async attendanceResolution => {
        appointmentExists.mockImplementation(async query => {
            expect(query.attendanceResolution).toBeNull();
            return attendanceResolution == null ? { _id: appointmentId } : null;
        });
        const unresolved = await findReceptionPatientByRamq({ clinicId, ramq: "TEST0001", authUser });
        expect(unresolved.hasHistoricalScheduledAppointments).toBe(true);
        appointmentExists.mockResolvedValueOnce(null);
        expect(await findReceptionPatientByRamq({ clinicId, ramq: "TEST0001", authUser })).not.toHaveProperty("hasHistoricalScheduledAppointments");
    });
});


describe("ordered WalkIn clinic and IPS routing", () => {
    const nearId = "507f1f77bcf86cd799439041", farId = "507f1f77bcf86cd799439042", outsideId = "507f1f77bcf86cd799439043", missingId = "507f1f77bcf86cd799439044";
    const ipsId = "507f1f77bcf86cd799439051", urgentId = "507f1f77bcf86cd799439052", familyId = "507f1f77bcf86cd799439053";
    const ipsAccount = "507f1f77bcf86cd799439061", patientId = "507f1f77bcf86cd799439071", appointmentId = "507f1f77bcf86cd799439072";
    const origin = { _id: clinicId, nom: "Origin", lat: 45, long: -73 };
    const near = { _id: nearId, nom: "Near", lat: 45.1, long: -73 };
    const far = { _id: farId, nom: "Far", lat: 45.2, long: -73 };
    const outside = { _id: outsideId, nom: "Outside", lat: 47, long: -73 };
    const missing = { _id: missingId, nom: "Missing" };
    const now = new Date("2030-01-01T13:00:00Z");
    const authUser = { userId: receptionId, sessionId: "synthetic-session", username: "synthetic-reception", role: "RECEPTION" };
    const location = (id, day = "2030-01-01") => ({ clinique: id, disponibilites: [], walkInDisponibilites: [new Date(day + "T14:00:00Z")] });
    const professional = (id, specialty, clinic, day) => ({ _id: id, specialite: specialty, accountUserId: specialty === "IPS" ? ipsAccount : physicianId,
        prenom: "Synthetic", nom: specialty, practiceLocations: [location(clinic, day)] });
    function directory(professionals, clinics = [origin, near, far, outside, missing]) {
        specialistFind.mockReturnValue(resolvedLean(professionals));
        clinicFindOne.mockReturnValue(resolvedLean(origin));
        const ids = new Set(professionals.flatMap(s => s.practiceLocations.map(l => l.clinique)));
        clinicFind.mockReturnValue(resolvedLean(clinics.filter(c => ids.has(c._id))));
        adminUserFind.mockReturnValue(resolvedLean([{ _id: physicianId, role: "MEDECIN" }, { _id: ipsAccount, role: "IPS" }]));
        adminUserFindOne.mockImplementation(query => resolvedLean(query.role === "RECEPTION" ? { assignedClinics: [clinicId] } : { _id: query._id }));
        appointmentCount.mockReturnValue({ session: vi.fn().mockResolvedValue(0) });
        getAvailableSlotSchedule.mockResolvedValue({ slots: ["09:00"] });
    }
    const list = extra => listWalkInFamilyMedicineOptions({ clinicId, authUser, now, ...extra });

    it("prefers a future urgentologist to today's IPS and family medicine in the same clinic", async () => {
        directory([professional(familyId, "Medecin de famille", clinicId), professional(ipsId, "IPS", clinicId), professional(urgentId, "Urgentologue", clinicId, "2030-01-02")]);
        const result = await list();
        expect(result).toMatchObject({ prioritySpecialty: "Urgentologue", selectedClinic: { _id: clinicId, distanceKm: 0 }, search: { status: "found" }, today: [] });
        expect(result.future).toHaveLength(1);
        expect(result.future[0].specialist._id).toBe(urgentId);
        expect(getAvailableSlotSchedule.mock.calls.every(([id]) => id === urgentId)).toBe(true);
    });
    it("offers IPS before family medicine when urgentology has no remaining configured slots", async () => {
        directory([professional(urgentId, "Urgentologue", clinicId), professional(familyId, "Medecin de famille", clinicId), professional(ipsId, "IPS", clinicId)]);
        getAvailableSlotSchedule.mockImplementation(async id => ({ slots: id === urgentId ? [] : ["09:00"] }));
        const result = await list();
        expect(result.prioritySpecialty).toBe("IPS");
        expect(result.today[0].specialist).toMatchObject({ _id: ipsId, specialty: "IPS" });
        expect(getAvailableSlotSchedule.mock.calls.some(([id]) => id === familyId)).toBe(false);
    });
    it("keeps a future family slot at origin before an urgentologist in a neighboring clinic", async () => {
        directory([professional(familyId, "Medecin de famille", clinicId, "2030-01-02"), professional(urgentId, "Urgentologue", nearId)]);
        const result = await list();
        expect(result.selectedClinic._id).toBe(clinicId);
        expect(result.prioritySpecialty).toBe("Medecin de famille");
        expect(getAvailableSlotSchedule.mock.calls.every(([, , options]) => options.clinique === clinicId)).toBe(true);
    });
    it("uses the closest clinic before a farther clinic's higher-priority professional", async () => {
        directory([professional(urgentId, "Urgentologue", farId), professional(familyId, "Medecin de famille", nearId, "2030-01-02")]);
        const result = await list();
        expect(result.selectedClinic._id).toBe(nearId);
        expect(result.prioritySpecialty).toBe("Medecin de famille");
        expect(result.search.examinedClinics).toBe(2);
        expect(getAvailableSlotSchedule.mock.calls.every(([, , options]) => options.clinique === nearId)).toBe(true);
    });
    it("skips an empty nearby clinic and stops at the first actual capacity", async () => {
        directory([professional(familyId, "Medecin de famille", nearId), professional(ipsId, "IPS", farId)]);
        getAvailableSlotSchedule.mockImplementation(async (_id, _date, options) => ({ slots: options.clinique === nearId ? [] : ["09:00"] }));
        expect((await list()).selectedClinic._id).toBe(farId);
    });
    it("never searches beyond 100km or in an unlocated clinic and cannot falsely declare exhaustion", async () => {
        directory([professional(urgentId, "Urgentologue", outsideId), professional(ipsId, "IPS", missingId)]);
        const result = await list();
        expect(result).toMatchObject({ today: [], future: [], search: { status: "location_missing", hasUnlocatedClinics: true, examinedClinics: 1 } });
        expect(getAvailableSlotSchedule).not.toHaveBeenCalled();
    });
    it("returns true exhaustion only when all eligible located clinics within the radius are empty", async () => {
        directory([professional(ipsId, "IPS", nearId), professional(urgentId, "Urgentologue", outsideId)]);
        getAvailableSlotSchedule.mockResolvedValue({ slots: [] });
        expect(await list()).toMatchObject({ today: [], future: [], search: { status: "exhausted", examinedClinics: 2 } });
    });
    it("warns about unknown clinic positions while offering capacity from a located neighbor", async () => {
        directory([professional(ipsId, "IPS", nearId), professional(urgentId, "Urgentologue", missingId)]);
        expect(await list()).toMatchObject({ selectedClinic: { _id: nearId }, search: { status: "found", hasUnlocatedClinics: true } });
    });
    it.each([true, false])("handles missing origin coordinates without guessing distances (local capacity %s)", async available => {
        directory([professional(ipsId, "IPS", clinicId), professional(urgentId, "Urgentologue", nearId)]);
        clinicFindOne.mockReturnValue(resolvedLean({ ...origin, lat: null }));
        getAvailableSlotSchedule.mockResolvedValue({ slots: available ? ["09:00"] : [] });
        const result = await list();
        expect(result.search.status).toBe(available ? "found" : "location_missing");
        expect(getAvailableSlotSchedule.mock.calls.every(([, , options]) => options.clinique === clinicId)).toBe(true);
    });
    it("excludes active account and directory profession mismatches before reading schedules", async () => {
        directory([{ ...professional(ipsId, "IPS", clinicId), accountUserId: physicianId }, { ...professional(urgentId, "Urgentologue", clinicId), accountUserId: ipsAccount }]);
        const result = await list();
        expect(result.search.status).toBe("exhausted");
        expect(getAvailableSlotSchedule).not.toHaveBeenCalled();
    });
    it("validates an existing patient's origin proof before searching any clinic", async () => {
        directory([professional(ipsId, "IPS", nearId)]);
        validateReceptionBookingProof.mockRejectedValueOnce({ code: "RECEPTION_LOOKUP_REQUIRED" });
        await expect(list({ patientId, bookingProof: "foreign-proof" })).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
        expect(validateReceptionBookingProof).toHaveBeenCalledWith({ authUser, clinicId, patientId, bookingProof: "foreign-proof" });
        expect(specialistFind).not.toHaveBeenCalled();
    });

    function prepareBooking(professionals = [professional(ipsId, "IPS", nearId)]) {
        directory(professionals);
        specialistFindOne.mockReturnValue(resolvedLean(professionals[0]));
        patientExists.mockResolvedValue(null);
        createPatient.mockResolvedValue({ _id: patientId, nom: "Synthetic", prenom: "Only" });
        patientFindOne.mockReturnValue(resolvedLean({ _id: patientId, nom: "Synthetic", prenom: "Only", ownerUserId: null }));
        createAppointment.mockResolvedValue({ _id: appointmentId });
        return { clinicId: nearId, originClinicId: clinicId, specialistId: ipsId, date: "2030-01-01", time: "09:00", authUser,
            patientId, bookingProof: "origin-proof", patientDto: { nom: "Synthetic", prenom: "Only", num_assurance_maladie: "TEST-ROUTING" } };
    }
    it("creates a new arrival at the selected unassigned nearby clinic with the real origin actor", async () => {
        const args = prepareBooking();
        const result = await createWalkInPatientAndAppointment(args);
        expect(result.writeAuditRecorded).toBe(true);
        expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({ clinique: nearId, specialist: ipsId }), authUser,
            expect.objectContaining({ receptionOriginClinicId: clinicId, receivingPhysicianUserId: ipsAccount, session: transactionSession }));
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: receptionId, actorRole: "RECEPTION", resourceId: appointmentId, session: transactionSession }));
        expect(adminUserFindOne).toHaveBeenCalledWith({ _id: ipsAccount, role: "IPS", isActive: true }, { _id: 1 });
    });
    it("keeps existing-patient lookup proof bound to the origin and checks destination pending state", async () => {
        const args = prepareBooking();
        await createWalkInAppointmentForExistingPatient(args);
        expect(consumeReceptionBookingProof).toHaveBeenCalledWith(expect.objectContaining({ clinicId, patientId, bookingProof: "origin-proof", session: transactionSession }));
        expect(appointmentFind).toHaveBeenCalledWith(expect.objectContaining({ clinique: clinicId }), expect.anything());
        expect(appointmentFind).toHaveBeenCalledWith(expect.objectContaining({ clinique: nearId }), expect.anything());
        expect(createPatient).not.toHaveBeenCalled();
        expect(createAppointment.mock.calls[0][2].patientFromTransaction.ownerUserId).toBeNull();
    });
    it("refuses a pending destination appointment without exposing its details or creating another", async () => {
        const args = prepareBooking();
        appointmentFind.mockImplementation(query => resolvedLean(query.clinique === nearId ? [{ _id: appointmentId, date: "2030-01-01", time: "08:00", specialist: ipsId }] : []));
        let caught;
        try { await createWalkInAppointmentForExistingPatient(args); } catch (error) { caught = error; }
        expect(caught.code).toBe("RECEPTION_REPLAN_REQUIRED");
        expect(JSON.stringify(caught)).not.toContain(appointmentId);
        expect(createAppointment).not.toHaveBeenCalled();
    });
    it("rejects a forged origin or destination and rechecks routing before patient creation", async () => {
        const args = prepareBooking();
        await expect(createWalkInPatientAndAppointment({ ...args, originClinicId: farId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(createWalkInPatientAndAppointment({ ...args, clinicId: outsideId })).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createPatient).not.toHaveBeenCalled();
    });
    it("requires a new selection if the origin regains higher-priority capacity before confirmation", async () => {
        const args = prepareBooking([professional(ipsId, "IPS", nearId), professional(urgentId, "Urgentologue", clinicId)]);
        await expect(createWalkInPatientAndAppointment(args)).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createPatient).not.toHaveBeenCalled();
        expect(createAppointment).not.toHaveBeenCalled();
    });
    it("moves only the origin reservation and links both records in the destination booking transaction", async () => {
        const args = prepareBooking();
        const oldId = "507f1f77bcf86cd799439081";
        const previous = { _id: oldId, specialist: specialistId, date: "2030-01-01", time: "08:00" };
        appointmentFind.mockImplementation(query => resolvedLean(query.clinique === clinicId ? [previous] : []));
        await createWalkInAppointmentForExistingPatient({ ...args, replaceAppointmentId: oldId });
        expect(appointmentUpdateOne).toHaveBeenCalledWith({ _id: oldId, patient: patientId, clinique: clinicId, status: "scheduled" }, { $set: { status: "rescheduled" } }, { session: transactionSession });
        expect(appointmentUpdateOne).toHaveBeenCalledWith({ _id: appointmentId }, { $set: { rescheduledFrom: oldId } }, { session: transactionSession });
        expect(appointmentUpdateOne).toHaveBeenCalledWith({ _id: oldId }, { $set: { rescheduledTo: appointmentId } }, { session: transactionSession });
        expect(releaseDailyAppointmentCapacity).toHaveBeenCalledWith(expect.objectContaining({ specialist: specialistId, session: transactionSession }));
        expect(recordWriteOperationAuditEvent.mock.calls.map(([event]) => event.operation)).toEqual(["UPDATE", "CREATE"]);
    });
    it("reruns origin access and destination selection on each transaction retry", async () => {
        const args = prepareBooking();
        transactionSession.withTransaction.mockImplementationOnce(async callback => { await callback(); await callback(); });
        await createWalkInAppointmentForExistingPatient(args);
        expect(clinicFindOne).toHaveBeenCalledTimes(2);
        expect(consumeReceptionBookingProof).toHaveBeenCalledTimes(2);
        expect(patientFindOneAndUpdate).toHaveBeenCalledTimes(2);
        expect(specialistFind.mock.results.every(({ value }) => value.session.mock.calls[0][0] === transactionSession)).toBe(true);
    });
    it("compares neighboring appointments explicitly without replacing the primary local offer", async () => {
        const pros = [professional(urgentId, "Urgentologue", clinicId, "2030-01-31"), professional(ipsId, "IPS", nearId, "2030-01-02")];
        directory(pros);
        const normal = await list();
        expect(normal).not.toHaveProperty("earlierAlternatives");
        expect(getAvailableSlotSchedule.mock.calls.every(([, , opts]) => opts.clinique === clinicId)).toBe(true);
        const compared = await list({ compareEarlier: true });
        const { earlierAlternatives, ...unchanged } = compared;
        expect(unchanged).toEqual(normal);
        expect(earlierAlternatives).toEqual([expect.objectContaining({ date: "2030-01-02", slots: ["09:00"], prioritySpecialty: "IPS", clinic: expect.objectContaining({ _id: nearId }), specialist: expect.objectContaining({ _id: ipsId }) })]);
        expect(createAppointment).not.toHaveBeenCalled();
        expect(createPatient).not.toHaveBeenCalled();
    });
    it("filters individual times strictly before the earliest primary and never compares another origin specialty", async () => {
        directory([professional(urgentId, "Urgentologue", clinicId, "2030-01-02"), professional(ipsId, "IPS", nearId, "2030-01-02"), professional(familyId, "Medecin de famille", clinicId)]);
        getAvailableSlotSchedule.mockImplementation(async id => ({ slots: id === urgentId ? ["10:00", "11:00"] : ["09:00", "10:00", "12:00"] }));
        const result = await list({ compareEarlier: true });
        expect(result.earlierAlternatives).toHaveLength(1);
        expect(result.earlierAlternatives[0]).toMatchObject({ slots: ["09:00"], slotTypes: { "09:00": "walk_in" } });
        expect(getAvailableSlotSchedule.mock.calls.some(([id]) => id === familyId)).toBe(false);
    });
    it("orders all neighboring professions chronologically then by distance then specialty", async () => {
        const familyNear = "507f1f77bcf86cd799439090", urgentNear = "507f1f77bcf86cd799439091";
        directory([professional(urgentId, "Urgentologue", clinicId, "2030-01-31"), professional(familyId, "Medecin de famille", farId, "2030-01-02"), professional(ipsId, "IPS", nearId, "2030-01-03"), professional(familyNear, "Medecin de famille", nearId, "2030-01-03"), professional(urgentNear, "Urgentologue", nearId, "2030-01-03")]);
        const alternatives = (await list({ compareEarlier: true })).earlierAlternatives;
        expect(alternatives.map(o => o.specialist._id)).toEqual([familyId, urgentNear, ipsId, familyNear]);
        expect(alternatives.map(o => o.clinic._id)).toContain(farId);
    });
    it("bounds chronological alternatives to eight groups while retaining all available times within each", async () => {
        const neighbor = professional(ipsId, "IPS", nearId);
        neighbor.practiceLocations[0].walkInDisponibilites = Array.from({ length: 12 }, (_, index) => new Date(`2030-01-${String(index + 2).padStart(2, "0")}T14:00:00Z`));
        directory([professional(urgentId, "Urgentologue", clinicId, "2030-01-31"), neighbor]);
        getAvailableSlotSchedule.mockResolvedValue({ slots: ["09:00", "09:15"] });
        const alternatives = (await list({ compareEarlier: true })).earlierAlternatives;
        expect(alternatives).toHaveLength(8);
        expect(alternatives.map(o => o.date)).toEqual(Array.from({ length: 8 }, (_, index) => `2030-01-${String(index + 2).padStart(2, "0")}`));
        expect(alternatives.every(o => o.slots.length === 2)).toBe(true);
    });
    it("includes earlier lower-priority offers in the selected neighboring clinic", async () => {
        directory([professional(urgentId, "Urgentologue", nearId, "2030-01-31"), professional(ipsId, "IPS", nearId, "2030-01-02")]);
        const result = await list({ compareEarlier: true });
        expect(result.selectedClinic._id).toBe(nearId);
        expect(result.prioritySpecialty).toBe("Urgentologue");
        expect(result.earlierAlternatives[0]).toMatchObject({ clinic: { _id: nearId }, prioritySpecialty: "IPS", date: "2030-01-02" });
    });
    it("excludes distant or unlocated alternatives and preserves the incomplete geography warning", async () => {
        directory([professional(urgentId, "Urgentologue", clinicId, "2030-01-31"), professional(ipsId, "IPS", outsideId), professional(familyId, "Medecin de famille", missingId)]);
        const result = await list({ compareEarlier: true });
        expect(result.earlierAlternatives).toEqual([]);
        expect(result.search.hasUnlocatedClinics).toBe(true);
        expect(getAvailableSlotSchedule.mock.calls.every(([, , opts]) => opts.clinique === clinicId)).toBe(true);
    });
    it.each([true, false])("returns no comparison when primary is unavailable or origin is unlocated (%s)", async missingCoords => {
        directory([professional(urgentId, "Urgentologue", clinicId), professional(ipsId, "IPS", nearId)]);
        if (missingCoords) clinicFindOne.mockReturnValue(resolvedLean({ ...origin, lat: null }));
        else getAvailableSlotSchedule.mockResolvedValue({ slots: [] });
        expect((await list({ compareEarlier: true })).earlierAlternatives).toEqual([]);
    });
    it("requires the exact patient proof before an explicit temporal comparison", async () => {
        directory([professional(ipsId, "IPS", nearId)]);
        validateReceptionBookingProof.mockRejectedValueOnce({ code: "RECEPTION_LOOKUP_REQUIRED" });
        await expect(list({ patientId, bookingProof: "wrong", compareEarlier: true })).rejects.toMatchObject({ code: "RECEPTION_LOOKUP_REQUIRED" });
        expect(specialistFind).not.toHaveBeenCalled();
    });
    function earlierBooking(primaryDay = "2030-01-31", targetDay = "2030-01-02") {
        const args = prepareBooking([professional(ipsId, "IPS", nearId, targetDay), professional(urgentId, "Urgentologue", clinicId, primaryDay)]);
        return { ...args, date: targetDay, selectionMode: "earlier" };
    }
    it("books a real earlier neighboring choice only with the explicit selection mode", async () => {
        const args = earlierBooking();
        await expect(createWalkInPatientAndAppointment({ ...args, selectionMode: "priority" })).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createPatient).not.toHaveBeenCalled();
        await createWalkInPatientAndAppointment(args);
        expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({ clinique: nearId, date: "2030-01-02" }), authUser, expect.objectContaining({ receptionOriginClinicId: clinicId, session: transactionSession }));
    });
    it.each(["2030-01-02", "2030-01-03"])("rejects a target at or after the primary (%s)", async targetDay => {
        await expect(createWalkInPatientAndAppointment(earlierBooking("2030-01-02", targetDay))).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createPatient).not.toHaveBeenCalled();
    });
    it("rejects forged origin choices, unsupported modes and options outside the radius", async () => {
        const args = earlierBooking();
        await expect(createWalkInPatientAndAppointment({ ...args, clinicId, specialistId: urgentId, date: "2030-01-31" })).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        await expect(createWalkInPatientAndAppointment({ ...args, selectionMode: "bypass" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        directory([professional(ipsId, "IPS", outsideId, "2030-01-02"), professional(urgentId, "Urgentologue", clinicId, "2030-01-31")]);
        await expect(createWalkInPatientAndAppointment({ ...args, clinicId: outsideId })).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createPatient).not.toHaveBeenCalled();
    });
    it("recomputes earlier eligibility on transaction retry and refuses a newly earlier primary", async () => {
        const args = earlierBooking();
        transactionSession.withTransaction.mockImplementationOnce(async callback => {
            await callback();
            directory([professional(ipsId, "IPS", nearId, "2030-01-02"), professional(urgentId, "Urgentologue", clinicId, "2030-01-01")]);
            await callback();
        });
        await expect(createWalkInPatientAndAppointment(args)).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createAppointment).toHaveBeenCalledTimes(1);
        expect(clinicFindOne).toHaveBeenCalledTimes(2);
    });

    function toleranceDirectory(professionals, distance) {
        directory(professionals);
        clinicFindOne.mockReturnValue(resolvedLean({ ...origin, lat: 0, long: 0 }));
        clinicFind.mockReturnValue(resolvedLean([{ ...near, lat: 0, long: distance / 6371 * 180 / Math.PI }]));
    }
    it.each([[100, true], [105, true], [109.9999, true], [110.001, false]])("uses the effective radius for default routing (%s km)", async (distance, admitted) => {
        toleranceDirectory([professional(ipsId, "IPS", nearId)], distance);
        const result = await list();
        expect(result.search).toMatchObject({ radiusKm: 100, toleranceKm: 10, maxDistanceKm: 110, status: admitted ? "found" : "exhausted" });
        expect(result.selectedClinic?._id).toBe(admitted ? nearId : undefined);
        if (!admitted) expect(getAvailableSlotSchedule).not.toHaveBeenCalled();
    });
    it.each([[110.1, true], [199.9999, true], [200.1, false]])("searches to 200 km after explicit agreement (%s km)", async (distance, admitted) => {
        toleranceDirectory([professional(ipsId, "IPS", nearId)], distance);
        const result = await list({ extendedSearchAccepted: true });
        expect(result.search).toMatchObject({ radiusKm: 200, maxDistanceKm: 200, status: admitted ? "found" : "exhausted" });
        expect(result.selectedClinic?._id).toBe(admitted ? nearId : undefined);
    });
    it("keeps a local offer ahead of a distant one even after agreement", async () => {
        const professionals = [professional(ipsId, "IPS", nearId), professional(urgentId, "Urgentologue", clinicId)];
        toleranceDirectory(professionals, 150);
        const result = await list({ extendedSearchAccepted: true, compareEarlier: true });
        expect(result).toMatchObject({ selectedClinic: { _id: clinicId }, search: { maxDistanceKm: 110 }, earlierAlternatives: [] });
    });
    it("requires agreement again for booking beyond 110 km and rechecks current local availability", async () => {
        const professionals = [professional(ipsId, "IPS", nearId)];
        const args = prepareBooking(professionals);
        toleranceDirectory(professionals, 110.1);
        await expect(createWalkInPatientAndAppointment(args)).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createPatient).not.toHaveBeenCalled();
        await expect(createWalkInPatientAndAppointment({ ...args, extendedSearchAccepted: true })).resolves.toMatchObject({ writeAuditRecorded: true });
        expect(createAppointment).toHaveBeenCalledTimes(1);
        toleranceDirectory([...professionals, professional(urgentId, "Urgentologue", clinicId)], 110.1);
        await expect(createWalkInPatientAndAppointment({ ...args, extendedSearchAccepted: true })).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createAppointment).toHaveBeenCalledTimes(1);
    });
    it.each([[105, true], [110.001, false]])("uses the same limit for comparison and transactional booking (%s km)", async (distance, admitted) => {
        const professionals = [professional(ipsId, "IPS", nearId, "2030-01-02"), professional(urgentId, "Urgentologue", clinicId, "2030-01-31")];
        const args = prepareBooking(professionals);
        toleranceDirectory(professionals, distance);
        const compared = await list({ compareEarlier: true });
        expect(compared.selectedClinic._id).toBe(clinicId);
        expect(compared.earlierAlternatives).toHaveLength(admitted ? 1 : 0);
        const booking = { ...args, date: "2030-01-02", selectionMode: "earlier" };
        if (admitted) await expect(createWalkInPatientAndAppointment(booking)).resolves.toMatchObject({ writeAuditRecorded: true });
        else {
            await expect(createWalkInPatientAndAppointment(booking)).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
            expect(createPatient).not.toHaveBeenCalled();
            expect(createAppointment).not.toHaveBeenCalled();
        }
    });
    it("rejects a stale choice after a clinic moves beyond the effective limit", async () => {
        const professionals = [professional(ipsId, "IPS", nearId, "2030-01-02"), professional(urgentId, "Urgentologue", clinicId, "2030-01-31")];
        const args = prepareBooking(professionals);
        toleranceDirectory(professionals, 105);
        expect((await list({ compareEarlier: true })).earlierAlternatives).toHaveLength(1);
        toleranceDirectory(professionals, 110.001);
        await expect(createWalkInPatientAndAppointment({ ...args, date: "2030-01-02", selectionMode: "earlier" })).rejects.toMatchObject({ code: "NO_AVAILABILITY" });
        expect(createAppointment).not.toHaveBeenCalled();
    });

});
