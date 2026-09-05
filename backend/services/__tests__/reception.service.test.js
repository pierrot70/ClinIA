import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminUserFindOne = vi.fn();
const adminUserFind = vi.fn();
const specialistFindOne = vi.fn();
const specialistFind = vi.fn();
const patientFindOne = vi.fn();
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

vi.mock("../../models/Specialist.js", () => ({
    Specialist: { find: specialistFind, findOne: specialistFindOne },
}));

vi.mock("../../models/Patient.js", () => ({
    Patient: { findOne: patientFindOne, exists: patientExists },
}));

vi.mock("../../audit/patientAudit.js", () => ({ recordPatientAuditEvent }));
vi.mock("../../audit/writeOperationAudit.js", () => ({
    recordWriteOperationAuditEvent,
}));

vi.mock("../appointments.js", () => ({
    getPracticeLocations: (specialist) => specialist.practiceLocations || [],
    getAvailableSlotSchedule,
    createAppointment,
}));

vi.mock("../patients.js", () => ({ createPatient }));

const {
    findReceptionPatientByRamq,
    listWalkInFamilyMedicineOptions,
    createWalkInPatientAndAppointment,
    createWalkInAppointmentForExistingPatient,
} = await import("../reception.js");

const receptionId = "507f1f77bcf86cd799439011";
const clinicId = "507f1f77bcf86cd799439012";
const physicianId = "507f1f77bcf86cd799439014";
const specialistId = "507f1f77bcf86cd799439013";

function resolvedLean(value) {
    return { lean: vi.fn().mockResolvedValue(value), session: vi.fn().mockReturnThis() };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(transactionSession);
    transactionSession.withTransaction.mockImplementation(async (callback) => callback());
    transactionSession.endSession.mockResolvedValue();
    adminUserFindOne.mockImplementation(query => resolvedLean(query.role === "RECEPTION"
        ? { assignedClinics: [clinicId] } : { _id: physicianId }));
    adminUserFind.mockReturnValue(resolvedLean([{ _id: physicianId }]));
    specialistFindOne.mockReturnValue(resolvedLean({
        _id: specialistId, accountUserId: physicianId,
        practiceLocations: [{ clinique: clinicId }],
    }));
    specialistFind.mockReturnValue(resolvedLean([
        {
            _id: "507f1f77bcf86cd799439013",
            accountUserId: physicianId,
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
    it("excludes unlinked specialists and accounts that are not active physicians before looking up slots", async () => {
        const location = { clinique: clinicId, walkInDisponibilites: [new Date("2030-01-01T14:00:00Z")] };
        specialistFind.mockReturnValue(resolvedLean([
            { _id: specialistId, accountUserId: physicianId, practiceLocations: [location] },
            { _id: "507f1f77bcf86cd799439015", practiceLocations: [location] },
            { _id: "507f1f77bcf86cd799439016", accountUserId: "507f1f77bcf86cd799439017", practiceLocations: [location] },
        ]));
        const result = await listWalkInFamilyMedicineOptions({ clinicId, authUser: { userId: receptionId, role: "RECEPTION" }, now: new Date("2030-01-01T13:00:00Z") });
        expect(result.today.map(option => option.specialist._id)).toEqual([specialistId]);
        expect(adminUserFind).toHaveBeenCalledWith({ _id: { $in: [physicianId, "507f1f77bcf86cd799439017"] }, role: "MEDECIN", isActive: true }, { _id: 1 });
        expect(getAvailableSlotSchedule.mock.calls.every(([id]) => id === specialistId)).toBe(true);
    });

    it("returns no slots when no linked physician account is active", async () => {
        adminUserFind.mockReturnValue(resolvedLean([]));
        await expect(listWalkInFamilyMedicineOptions({ clinicId, authUser: { userId: receptionId, role: "RECEPTION" }, now: new Date("2030-01-01T13:00:00Z") })).resolves.toEqual({ today: [], future: [] });
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
            { clinique: clinicId, slotType: "walk_in" }
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
        })).resolves.toEqual({ today: [], future: [] });
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
            {
                clinique: clinicId,
                patient: "507f1f77bcf86cd799439088",
                slotType: "regular",
            }
        );
        expect(getAvailableSlotSchedule).toHaveBeenCalledWith(
            "507f1f77bcf86cd799439013",
            "2030-01-01",
            {
                clinique: clinicId,
                patient: "507f1f77bcf86cd799439088",
                slotType: "walk_in",
            }
        );
    });

    it("offers walk-in capacity to a patient already known to the clinic", async () => {
        specialistFind.mockReturnValue(resolvedLean([
            {
                _id: "507f1f77bcf86cd799439013",
                accountUserId: physicianId,
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
