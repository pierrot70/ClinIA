import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminUserFindOne = vi.fn();
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
    AdminUser: { findOne: adminUserFindOne },
}));

vi.mock("../../models/Specialist.js", () => ({
    Specialist: { find: specialistFind },
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
} = await import("../reception.js");

const receptionId = "507f1f77bcf86cd799439011";
const clinicId = "507f1f77bcf86cd799439012";

function resolvedLean(value) {
    return { lean: vi.fn().mockResolvedValue(value) };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(transactionSession);
    transactionSession.withTransaction.mockImplementation(async (callback) => callback());
    transactionSession.endSession.mockResolvedValue();
    adminUserFindOne.mockReturnValue(resolvedLean({ assignedClinics: [clinicId] }));
    specialistFind.mockReturnValue(resolvedLean([
        {
            _id: "507f1f77bcf86cd799439013",
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
            },
            authUser: { userId: receptionId, username: "reception", role: "RECEPTION" },
        })).resolves.toMatchObject({
            patient: { _id: "507f1f77bcf86cd799439088" },
            appointment: { _id: "507f1f77bcf86cd799439099" },
        });

        expect(createPatient).toHaveBeenCalledWith(
            expect.objectContaining({ num_assurance_maladie: "123456" }),
            expect.objectContaining({ userId: receptionId }),
            { session: transactionSession }
        );
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
                patientFromTransaction: expect.objectContaining({
                    _id: "507f1f77bcf86cd799439088",
                }),
            })
        );
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "PATIENT_CREATE",
                changedFields: ["nom", "prenom", "num_assurance_maladie"],
            })
        );
        expect(transactionSession.endSession).toHaveBeenCalledTimes(1);
    });
});
