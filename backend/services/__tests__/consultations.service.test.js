import mongoose from "mongoose";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AdminUser } from "../../models/AdminUser.js";
import { Specialist } from "../../models/Specialist.js";
import { Appointment } from "../../models/Appointment.js";
import { Patient } from "../../models/Patient.js";
import { PatientConsultationNote } from "../../models/PatientConsultationNote.js";
import { PatientAuditLog } from "../../models/PatientAuditLog.js";
import { listConsultations, readConsultation, addConsultationNote, acceptPatientCare } from "../consultations.js";

const doctor = "507f1f77bcf86cd799439011";
const specialist = "507f1f77bcf86cd799439012";
const appointmentId = "507f1f77bcf86cd799439013";
const patientId = "507f1f77bcf86cd799439014";
const otherDoctor = "507f1f77bcf86cd799439015";
const auth = { userId: doctor, role: "MEDECIN" };
const session = { withTransaction: vi.fn(async cb => cb()), endSession: vi.fn() };
const query = data => ({ session: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(data) });
let patient;
let appointment;
beforeEach(() => {
    patient = { _id: patientId, nom: "Synthetic", prenom: "Patient", ownerUserId: null, secure_request_profile: { clinicalNotes: "Previous history" } };
    appointment = { _id: appointmentId, patient: patientId, status: "scheduled" };
    vi.spyOn(AdminUser, "findOne").mockImplementation(() => query({ _id: doctor }));
    vi.spyOn(AdminUser, "find").mockImplementation(() => query([{ _id: otherDoctor, username: "Dr-Leroux" }]));
    vi.spyOn(AdminUser, "updateOne").mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(Specialist, "find").mockImplementation(() => query([{ _id: specialist }]));
    vi.spyOn(Specialist, "updateOne").mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(Appointment, "findOne").mockImplementation(() => query(appointment));
    vi.spyOn(Appointment, "find").mockImplementation(() => query([appointment]));
    vi.spyOn(Patient, "findOne").mockImplementation(() => query(patient));
    vi.spyOn(Patient, "find").mockImplementation(() => query([{ _id: patientId, nom: "Synthetic", prenom: "Patient" }]));
    vi.spyOn(PatientConsultationNote, "find").mockImplementation(() => query([{ note: "Prior doctor's note", authorUserId: otherDoctor }]));
    vi.spyOn(PatientConsultationNote, "create").mockResolvedValue([{ _id: "note-id" }]);
    vi.spyOn(Patient, "updateOne").mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(Appointment, "updateOne").mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(PatientAuditLog, "create").mockResolvedValue([{ _id: "audit-id" }]);
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
});
afterEach(() => vi.restoreAllMocks());

describe("consultation authorization and continuity", () => {
    it("lets the assigned physician read previous notes without taking ownership", async () => {
        const result = await readConsultation(appointmentId, auth);
        expect(result).toMatchObject({ fullHistory: true, inCare: false, canAcceptCare: true, legacyNote: "Previous history" });
        expect(result.notes[0].authorUserId).toBe(otherDoctor);
        expect(Appointment.findOne).toHaveBeenCalledWith(expect.objectContaining({ specialist: { $in: [specialist] }, status: { $in: ["scheduled", "completed"] } }), expect.anything());
        expect(PatientConsultationNote.find).toHaveBeenCalledWith({ patientId }, expect.anything());
        expect(Patient.updateOne).not.toHaveBeenCalled();
    });
    it.each(["RECEPTION", "SUPERADMIN", "ADMIN", "USER"])("denies clinical access to %s", async role => {
        await expect(readConsultation(appointmentId, { ...auth, role })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(Patient.findOne).not.toHaveBeenCalled();
    });
    it("rechecks active physician account, not just JWT role", async () => {
        AdminUser.findOne.mockReturnValue(query(null));
        await expect(readConsultation(appointmentId, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(Patient.findOne).not.toHaveBeenCalled();
    });
    it("does not grant access for clinic membership or a guessed appointment", async () => {
        Specialist.find.mockReturnValue(query([]));
        Appointment.findOne.mockReturnValue(query(null));
        await expect(readConsultation(appointmentId, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(Appointment.findOne).toHaveBeenCalledWith(expect.objectContaining({ specialist: { $in: [] } }), expect.anything());
        expect(Patient.findOne).not.toHaveBeenCalled();
    });
    it("rejects malformed appointment identifiers", async () => {
        await expect(readConsultation({ $ne: null }, auth)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });
    it("does not expose archived patient notes", async () => {
        Patient.findOne.mockReturnValue(query(null));
        await expect(readConsultation(appointmentId, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(PatientConsultationNote.find).not.toHaveBeenCalled();
    });
    it("restricts completed consultations to own entries unless care was accepted", async () => {
        appointment.status = "completed";
        const result = await readConsultation(appointmentId, auth);
        expect(result).toMatchObject({ fullHistory: false, legacyNote: "", canAddNote: false });
        expect(PatientConsultationNote.find).toHaveBeenCalledWith({ patientId, authorUserId: doctor, appointmentId }, expect.anything());
    });
    it("keeps history readable for the explicitly accepted patient", async () => {
        appointment.status = "completed";
        patient.ownerUserId = doctor;
        expect(await readConsultation(appointmentId, auth)).toMatchObject({ fullHistory: true, inCare: true });
    });
    it("appends an attributed note, never modifies another note or legacy profile", async () => {
        await addConsultationNote(appointmentId, " New note ", auth);
        expect(PatientConsultationNote.create).toHaveBeenCalledWith([{ patientId, appointmentId, authorUserId: doctor, note: "New note" }], { session });
        expect(Patient.updateOne).toHaveBeenCalledWith({ _id: patientId, archivedAt: null }, { $inc: { __v: 1 } }, { session });
        const audit = PatientAuditLog.create.mock.calls[0][0][0];
        expect(audit.action).toBe("CONSULTATION_NOTE_CREATE");
        expect(JSON.stringify(audit)).not.toContain("New note");
        expect(JSON.stringify(audit)).not.toContain("Synthetic");
    });
    it.each(["", " ", null, {}, "x".repeat(20001)])("rejects invalid note input %#", async note => {
        await expect(addConsultationNote(appointmentId, note, auth)).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(PatientConsultationNote.create).not.toHaveBeenCalled();
    });
    it("does not append after consultation completion", async () => {
        appointment.status = "completed";
        await expect(addConsultationNote(appointmentId, "note", auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("requires an explicit acceptance and atomically claims only an unassigned patient", async () => {
        await expect(acceptPatientCare(appointmentId, auth)).resolves.toEqual({ accepted: true });
        expect(Patient.updateOne).toHaveBeenCalledWith({ _id: patientId, archivedAt: null, ownerUserId: null }, { $set: { ownerUserId: doctor } }, { session });
        expect(PatientAuditLog.create.mock.calls[0][0][0].action).toBe("PATIENT_CARE_ACCEPT");
    });
    it("does not steal another doctor's patient", async () => {
        patient.ownerUserId = otherDoctor;
        await expect(acceptPatientCare(appointmentId, auth)).rejects.toMatchObject({ code: "CARE_ALREADY_ASSIGNED" });
        expect(Patient.updateOne).not.toHaveBeenCalled();
    });
    it("rejects concurrent care acceptance when the conditional update loses", async () => {
        Patient.updateOne.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({ modifiedCount: 0 });
        await expect(acceptPatientCare(appointmentId, auth)).rejects.toMatchObject({ code: "CARE_ALREADY_ASSIGNED" });
    });
    it("fails closed if read auditing fails", async () => {
        PatientAuditLog.create.mockRejectedValue(new Error("audit unavailable"));
        await expect(readConsultation(appointmentId, auth)).rejects.toThrow("audit unavailable");
    });
    it("lists only assigned consultations with minimal patient identity and no clinical data", async () => {
        expect(await listConsultations(auth)).toEqual([{ _id: appointmentId, status: "scheduled", date: undefined, time: undefined, patient: { _id: patientId, nom: "Synthetic", prenom: "Patient" } }]);
        expect(Patient.find).toHaveBeenCalledWith({ _id: { $in: [patientId] }, archivedAt: null }, { nom: 1, prenom: 1 });
    });
    it.each([AdminUser, Specialist, Appointment, Patient])("fails closed if authorization changes during a write %#", async model => {
        model.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
        await expect(addConsultationNote(appointmentId, "note", auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(PatientConsultationNote.create).not.toHaveBeenCalled();
    });
});
