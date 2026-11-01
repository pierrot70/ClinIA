import mongoose from "mongoose";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AdminUser } from "../../models/AdminUser.js";
import { Specialist } from "../../models/Specialist.js";
import { Patient } from "../../models/Patient.js";
import { PatientConsultationNote } from "../../models/PatientConsultationNote.js";
import { ClinicalCareAccessGrant } from "../../models/ClinicalCareAccessGrant.js";
import { PatientSharedConsultationNote } from "../../models/PatientSharedConsultationNote.js";
import { recordPatientAuditEvent } from "../../audit/patientAudit.js";
import { recordWriteOperationAuditEvent } from "../../audit/writeOperationAudit.js";
import { listEligibleCareClinicians, listPatientCareGrants, issuePatientCareGrant, revokePatientCareGrant, listIncomingCareGrants, readSharedCareRecord, listOwnedSharedCareNotes, appendSharedCareNote } from "../clinicalCareAccess.js";
vi.mock("../../audit/patientAudit.js", () => ({ recordPatientAuditEvent: vi.fn() }));
vi.mock("../../audit/writeOperationAudit.js", () => ({ recordWriteOperationAuditEvent: vi.fn() }));

const ids = { ips: "507f1f77bcf86cd799439011", doctor: "507f1f77bcf86cd799439012", patient: "507f1f77bcf86cd799439013", grant: "507f1f77bcf86cd799439014", ipsDirectory: "507f1f77bcf86cd799439015", doctorDirectory: "507f1f77bcf86cd799439016", note: "507f1f77bcf86cd799439017", other: "507f1f77bcf86cd799439018" };
const ips = { userId: ids.ips, username: "synthetic-ips", role: "IPS" };
const physician = { userId: ids.doctor, username: "synthetic-doctor", role: "MEDECIN" };
const metadata = { verificationId: "WRV-SYNTHETIC", requestId: "synthetic-request", ip: "127.0.0.1" };
const chain = value => ({ session: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value), then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
let patient, grant, accounts, professionals, shared, originals, session;
function patientMatch(filter) { return String(filter._id) === ids.patient && String(filter.ownerUserId) === String(patient.ownerUserId) && !patient.archivedAt ? patient : null; }
function grantMatch(filter) {
    if (filter._id && String(filter._id) !== ids.grant) return null;
    if (filter.targetUserId && String(filter.targetUserId) !== String(grant.targetUserId)) return null;
    if (filter.issuerUserId && String(filter.issuerUserId) !== String(grant.issuerUserId)) return null;
    if (filter.status && filter.status !== grant.status) return null;
    if (filter.permission && filter.permission !== grant.permission) return null;
    if (filter.expiresAt?.$gt && !(grant.expiresAt > filter.expiresAt.$gt)) return null;
    if (filter.expiresAt?.$lte && !(grant.expiresAt <= filter.expiresAt.$lte)) return null;
    return grant;
}
beforeEach(() => {
    patient = { _id: ids.patient, nom: "Synthetic", prenom: "Patient", ownerUserId: ids.ips, archivedAt: null,
        num_assurance_maladie: "SYNTHETIC_NOT_EXPORTED", telephone: "NOT_EXPORTED", email: "not-exported@example.test",
        secure_request_profile: { clinicalNotes: "Original immutable clinical text", objective: "Synthetic purpose", selected_document_ids: ["private-storage-key"], privacyAttestation: true, lastRequestedAt: new Date() } };
    grant = { _id: ids.grant, patientId: ids.patient, issuerUserId: ids.ips, targetUserId: ids.doctor, permission: "READ_APPEND", status: "ACTIVE", expiresAt: new Date(Date.now() + 3600000), createdAt: new Date() };
    accounts = [{ _id: ids.ips, username: ips.username, role: "IPS", isActive: true }, { _id: ids.doctor, username: physician.username, role: "MEDECIN", isActive: true }];
    professionals = [{ _id: ids.ipsDirectory, accountUserId: ids.ips, specialite: "IPS", nom: "Synthetic", prenom: "Nurse" }, { _id: ids.doctorDirectory, accountUserId: ids.doctor, specialite: "Urgentologue", nom: "Synthetic", prenom: "Physician" }];
    originals = [{ _id: ids.note, note: "Original encounter entry", authorUserId: ids.other, appointmentId: ids.other, createdAt: new Date() }];
    shared = [{ _id: ids.note, note: "Authored shared entry", authorUserId: ids.doctor, authorRole: "MEDECIN", authorSpecialty: "Urgentologue", createdAt: new Date() }];
    session = { withTransaction: vi.fn(async work => work()), endSession: vi.fn() };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session);
    vi.spyOn(AdminUser, "findOne").mockImplementation(filter => chain(accounts.find(a => a._id === String(filter._id) && a.role === filter.role && a.isActive) ?? null));
    vi.spyOn(AdminUser, "find").mockImplementation(filter => chain(accounts.filter(a => filter.role ? a.role === filter.role && a.isActive : filter._id.$in.map(String).includes(a._id))));
    vi.spyOn(AdminUser, "updateOne").mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(Specialist, "findOne").mockImplementation(filter => chain(professionals.find(s => s.accountUserId === String(filter.accountUserId)) ?? null));
    vi.spyOn(Specialist, "find").mockImplementation(() => chain(professionals));
    vi.spyOn(Specialist, "updateOne").mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(Patient, "findOne").mockImplementation(filter => chain(patientMatch(filter)));
    vi.spyOn(Patient, "findOneAndUpdate").mockImplementation(filter => chain(patientMatch(filter)));
    vi.spyOn(ClinicalCareAccessGrant, "findOne").mockImplementation(filter => chain(grantMatch(filter)));
    vi.spyOn(ClinicalCareAccessGrant, "find").mockImplementation(filter => chain(filter.expiresAt?.$lte ? (grantMatch(filter) ? [grant] : []) : [grant]));
    vi.spyOn(ClinicalCareAccessGrant, "exists").mockReturnValue(chain(null));
    vi.spyOn(ClinicalCareAccessGrant, "updateMany").mockResolvedValue({ modifiedCount: 0 });
    vi.spyOn(ClinicalCareAccessGrant, "updateOne").mockImplementation(filter => Promise.resolve({ modifiedCount: grantMatch(filter) ? 1 : 0 }));
    vi.spyOn(ClinicalCareAccessGrant, "findOneAndUpdate").mockImplementation((filter, update) => chain(grantMatch(filter) ? { ...grant, ...update.$set } : null));
    vi.spyOn(ClinicalCareAccessGrant, "create").mockImplementation(async values => values.map(v => ({ ...v, _id: ids.grant, createdAt: new Date() })));
    vi.spyOn(PatientConsultationNote, "find").mockImplementation(() => chain(originals));
    vi.spyOn(PatientSharedConsultationNote, "find").mockImplementation(() => chain(shared));
    vi.spyOn(PatientSharedConsultationNote, "create").mockResolvedValue([{ _id: ids.note }]);
    recordPatientAuditEvent.mockResolvedValue({ _id: ids.note });
    recordWriteOperationAuditEvent.mockResolvedValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("IPS-owned per-patient care invitations", () => {
    it.each(["USER", "RECEPTION", "ADMIN", "SUPERADMIN", "MEDECIN"])("never lets %s issue or revoke an IPS invitation", async role => {
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, { ...ips, role })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(revokePatientCareGrant(ids.grant, { ...ips, role })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(ClinicalCareAccessGrant.create).not.toHaveBeenCalled();
    });
    it.each([0, -1, 1441, 1.5, "60", null, Infinity])("rejects invalid duration %s", async durationMinutes => {
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor, durationMinutes }, ips)).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(ClinicalCareAccessGrant.create).not.toHaveBeenCalled();
    });
    it("issues only a fixed read-and-append invitation, with real role audit and retained ownership", async () => {
        const snapshot = structuredClone(patient);
        const result = await issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor, durationMinutes: 60, permission: "ADMIN" }, ips, metadata);
        expect(result).toMatchObject({ data: { patientId: ids.patient, issuerUserId: ids.ips, targetUserId: ids.doctor, permission: "READ_APPEND", status: "ACTIVE" }, writeAuditRecorded: true });
        expect(ClinicalCareAccessGrant.create).toHaveBeenCalledWith([expect.objectContaining({ permission: "READ_APPEND" })], { session });
        expect(Patient.findOneAndUpdate).toHaveBeenCalledWith({ _id: ids.patient, ownerUserId: ids.ips, archivedAt: null }, { $inc: { __v: 1 } }, expect.objectContaining({ session }));
        expect(patient).toEqual(snapshot);
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actorRole: "IPS", collectionName: "clinicalcareaccessgrants", operation: "CREATE", verificationId: metadata.verificationId, session, throwOnError: true }));
        expect(JSON.stringify(recordWriteOperationAuditEvent.mock.calls)).not.toContain("Synthetic");
    });
    it("rejects a foreign or archived patient and a missing/mismatched professional link", async () => {
        patient.ownerUserId = ids.other;
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips)).rejects.toMatchObject({ code: "FORBIDDEN" });
        patient.ownerUserId = ids.ips; patient.archivedAt = new Date();
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips)).rejects.toMatchObject({ code: "FORBIDDEN" });
        patient.archivedAt = null; professionals[0].specialite = "Urgentologue";
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(ClinicalCareAccessGrant.create).not.toHaveBeenCalled();
    });
    it.each(["IPS", "USER", "RECEPTION", "ADMIN", "SUPERADMIN"])("never authorizes target role %s", async role => {
        accounts[1].role = role;
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("rejects inactive accounts, missing directories and duplicate active invitations", async () => {
        accounts[1].isActive = false;
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips)).rejects.toMatchObject({ code: "FORBIDDEN" });
        accounts[1].isActive = true; professionals.pop();
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips)).rejects.toMatchObject({ code: "FORBIDDEN" });
        professionals.push({ _id: ids.doctorDirectory, accountUserId: ids.doctor, specialite: "Medecin de famille" });
        ClinicalCareAccessGrant.exists.mockReturnValue(chain({ _id: ids.grant }));
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips)).rejects.toMatchObject({ code: "CARE_ACCESS_ALREADY_ACTIVE" });
    });
    it("retains an expired invitation with its own mandatory UPDATE receipt before replacement", async () => {
        grant.expiresAt = new Date(Date.now() - 1);
        const result = await issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips, metadata);
        expect(result.data.status).toBe("ACTIVE");
        expect(recordWriteOperationAuditEvent.mock.calls.map(([event]) => event.operation)).toEqual(["UPDATE", "CREATE"]);
        expect(recordWriteOperationAuditEvent.mock.calls[0][0]).toMatchObject({ resourceId: ids.grant, patientId: ids.patient, changedFields: ["status"], actorRole: "IPS", session, throwOnError: true });
        expect(ClinicalCareAccessGrant.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: ids.grant, expiresAt: { $lte: expect.any(Date) } }), { $set: { status: "EXPIRED" }, $inc: { __v: 1 } }, { session });
    });
    it("does not create a replacement when the mandatory expiry receipt fails", async () => {
        grant.expiresAt = new Date(Date.now() - 1);
        recordWriteOperationAuditEvent.mockRejectedValue(new Error("synthetic expiry receipt failure"));
        await expect(issuePatientCareGrant(ids.patient, { targetUserId: ids.doctor }, ips, metadata)).rejects.toThrow("synthetic expiry receipt failure");
        expect(ClinicalCareAccessGrant.create).not.toHaveBeenCalled();
        expect(session.endSession).toHaveBeenCalled();
    });
    it("refuses a grant that expires while notes are being loaded or inserted", async () => {
        PatientConsultationNote.find.mockImplementation(() => { grant.expiresAt = new Date(Date.now() - 1); return chain(originals); });
        await expect(readSharedCareRecord(ids.grant, physician)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(recordPatientAuditEvent).not.toHaveBeenCalled();
        grant.expiresAt = new Date(Date.now() + 3600000);
        PatientSharedConsultationNote.create.mockImplementation(async () => { grant.expiresAt = new Date(Date.now() - 1); return [{ _id: ids.note }]; });
        await expect(appendSharedCareNote(ids.grant, "Synthetic note", physician)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(recordPatientAuditEvent).not.toHaveBeenCalled();
    });
    it("revokes only its owner's invitation and records the actual change atomically", async () => {
        const result = await revokePatientCareGrant(ids.grant, ips, metadata);
        expect(result).toMatchObject({ data: { status: "REVOKED", issuerUserId: ids.ips }, writeAuditRecorded: true });
        expect(ClinicalCareAccessGrant.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ issuerUserId: ids.ips, status: "ACTIVE" }), expect.objectContaining({ $set: { status: "REVOKED", revokedAt: expect.any(Date) } }), expect.objectContaining({ session }));
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "UPDATE", actorRole: "IPS", session }));
        grant.issuerUserId = ids.other;
        await expect(revokePatientCareGrant(ids.grant, ips)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("keeps directory and invitation lists minimal and owner scoped", async () => {
        expect(await listEligibleCareClinicians(ips)).toEqual([{ _id: ids.doctor, username: physician.username, professional: { nom: "Synthetic", prenom: "Physician", specialty: "Urgentologue" } }]);
        const rows = await listPatientCareGrants(ids.patient, ips);
        expect(rows[0].target).toEqual({ _id: ids.doctor, username: physician.username });
        expect(ClinicalCareAccessGrant.find).toHaveBeenCalledWith({ patientId: ids.patient, issuerUserId: ids.ips });
        expect(JSON.stringify(rows)).not.toContain("Original immutable clinical text");
    });
});

describe("the invited physician's bounded read and append capability", () => {
    it.each(["IPS", "USER", "RECEPTION", "ADMIN", "SUPERADMIN"])("does not turn %s into the invited physician", async role => {
        await expect(readSharedCareRecord(ids.grant, { ...physician, role })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(appendSharedCareNote(ids.grant, "Synthetic note", { ...physician, role })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(PatientConsultationNote.find).not.toHaveBeenCalled();
    });
    it.each(["foreign-target", "expired", "revoked", "changed-owner", "archived", "inactive-target", "inactive-issuer", "mismatched-directory"])("rejects %s on every record read and note append", async condition => {
        if (condition === "foreign-target") grant.targetUserId = ids.other;
        if (condition === "expired") grant.expiresAt = new Date(Date.now() - 1);
        if (condition === "revoked") grant.status = "REVOKED";
        if (condition === "changed-owner") patient.ownerUserId = ids.other;
        if (condition === "archived") patient.archivedAt = new Date();
        if (condition === "inactive-target") accounts[1].isActive = false;
        if (condition === "inactive-issuer") accounts[0].isActive = false;
        if (condition === "mismatched-directory") professionals[1].specialite = "IPS";
        await expect(readSharedCareRecord(ids.grant, physician)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(appendSharedCareNote(ids.grant, "Synthetic note", physician)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(PatientSharedConsultationNote.create).not.toHaveBeenCalled();
    });
    it("returns only clinical profile and attributed notes, without extra identifiers/storage keys", async () => {
        const result = await readSharedCareRecord(ids.grant, physician, metadata);
        expect(result).toMatchObject({ patient: { _id: ids.patient, nom: "Synthetic", prenom: "Patient" }, profile: { clinicalNotes: "Original immutable clinical text" }, canAppendNote: true });
        expect(result.originalNotes[0]).toMatchObject({ note: "Original encounter entry", authorRole: null });
        expect(result.sharedNotes[0]).toMatchObject({ authorRole: "MEDECIN", authorSpecialty: "Urgentologue", author: { username: physician.username } });
        expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC_NOT_EXPORTED|NOT_EXPORTED|private-storage-key|privacyAttestation|lastRequestedAt/);
        expect(ClinicalCareAccessGrant.updateOne).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: ids.doctor, status: "ACTIVE", expiresAt: { $gt: expect.any(Date) } }), { $inc: { __v: 1 } }, { session });
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "CONSULTATION_READ", actorRole: "MEDECIN", session, throwOnError: true }));
    });
    it("appends a new attributed note and mandatory receipts without altering source notes or patient owner", async () => {
        const snapshot = structuredClone(patient);
        const result = await appendSharedCareNote(ids.grant, "  SYNTHETIC_SECRET_NOTE  ", physician, metadata);
        expect(result).toEqual({ data: { _id: ids.note }, writeAuditRecorded: true });
        expect(PatientSharedConsultationNote.create).toHaveBeenCalledWith([{ patientId: ids.patient, grantId: ids.grant, authorUserId: ids.doctor, authorRole: "MEDECIN", authorSpecialty: "Urgentologue", note: "SYNTHETIC_SECRET_NOTE" }], { session });
        expect(patient).toEqual(snapshot);
        expect(PatientConsultationNote.find).not.toHaveBeenCalled();
        expect(recordPatientAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "CONSULTATION_NOTE_CREATE", session }));
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ collectionName: "patientsharedconsultationnotes", operation: "CREATE", session, verificationId: metadata.verificationId }));
        expect(JSON.stringify([recordPatientAuditEvent.mock.calls, recordWriteOperationAuditEvent.mock.calls])).not.toContain("SYNTHETIC_SECRET_NOTE");
    });
    it.each([null, {}, "", " ", "x".repeat(20001)])("rejects invalid note %#", async note => {
        await expect(appendSharedCareNote(ids.grant, note, physician)).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(PatientSharedConsultationNote.create).not.toHaveBeenCalled();
    });
    it("rejects the record transaction if its invitation expires during the awaited read audit", async () => {
        const startedAt = new Date("2026-11-01T12:00:00.000Z");
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            vi.setSystemTime(startedAt);
            grant.expiresAt = new Date(startedAt.getTime() + 1000);
            recordPatientAuditEvent.mockImplementation(async () => {
                await Promise.resolve();
                vi.setSystemTime(startedAt.getTime() + 1001);
            });
            await expect(readSharedCareRecord(ids.grant, physician, metadata)).rejects.toMatchObject({ code: "FORBIDDEN" });
            expect(recordPatientAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "CONSULTATION_READ", session }));
            expect(session.endSession).toHaveBeenCalled();
        } finally { vi.useRealTimers(); }
    });
    it.each(["patient", "write"])("rejects the append transaction if its invitation expires during the awaited %s audit", async audit => {
        const startedAt = new Date("2026-11-01T12:00:00.000Z");
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            vi.setSystemTime(startedAt);
            grant.expiresAt = new Date(startedAt.getTime() + 1000);
            const pendingAudit = audit === "patient" ? recordPatientAuditEvent : recordWriteOperationAuditEvent;
            pendingAudit.mockImplementation(async () => {
                await Promise.resolve();
                vi.setSystemTime(startedAt.getTime() + 1001);
            });
            await expect(appendSharedCareNote(ids.grant, "Synthetic note", physician, metadata)).rejects.toMatchObject({ code: "FORBIDDEN" });
            expect(PatientSharedConsultationNote.create).toHaveBeenCalledWith([expect.objectContaining({ authorUserId: ids.doctor })], { session });
            expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "CREATE", session }));
            expect(session.endSession).toHaveBeenCalled();
        } finally { vi.useRealTimers(); }
    });
    it("does not commit when a mandatory audit fails or when revocation wins the grant lock", async () => {
        recordWriteOperationAuditEvent.mockRejectedValue(new Error("synthetic receipt failure"));
        await expect(appendSharedCareNote(ids.grant, "Synthetic note", physician)).rejects.toThrow("synthetic receipt failure");
        expect(session.endSession).toHaveBeenCalled();
        recordWriteOperationAuditEvent.mockResolvedValue(true);
        ClinicalCareAccessGrant.updateOne.mockResolvedValue({ modifiedCount: 0 });
        PatientSharedConsultationNote.create.mockClear();
        await expect(appendSharedCareNote(ids.grant, "Synthetic note", physician)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(PatientSharedConsultationNote.create).not.toHaveBeenCalled();
    });
    it("lets the IPS read appended notes through its owned patient without granting the physician other dossiers", async () => {
        expect(await listOwnedSharedCareNotes(ids.patient, ips, metadata)).toMatchObject({ sharedNotes: [{ note: "Authored shared entry" }], notesTruncated: false });
        await expect(listOwnedSharedCareNotes(ids.patient, physician)).rejects.toMatchObject({ code: "FORBIDDEN" });
        const inbox = await listIncomingCareGrants(physician);
        expect(inbox).toHaveLength(1);
        expect(inbox[0]).toMatchObject({ patient: { _id: ids.patient, nom: "Synthetic" }, issuer: { username: ips.username } });
        patient.ownerUserId = ids.other;
        expect(await listIncomingCareGrants(physician)).toEqual([]);
    });
});
