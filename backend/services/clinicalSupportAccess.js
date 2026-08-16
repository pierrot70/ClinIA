import mongoose from "mongoose";
import { ClinicalSupportAccessRequest } from "../models/ClinicalSupportAccessRequest.js";
import { Patient } from "../models/Patient.js";
import { AdminUser } from "../models/AdminUser.js";
import { recordWriteOperationAuditEvent } from "../audit/writeOperationAudit.js";

const REASON_CODES = new Set(["TECHNICAL_SUPPORT", "SECURITY_INCIDENT", "DATA_ACCESS_REQUEST"]);

function fail(code, message) { throw { code, message }; }

export async function createPhysicianClinicalSupportRequest({ patientId, reasonCode, authUser }) {
    if (authUser?.role !== "MEDECIN") fail("FORBIDDEN", "Action reservee au medecin proprietaire du dossier.");
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
        fail("INVALID_INPUT", "Identifiant de dossier invalide.");
    }
    if (!REASON_CODES.has(reasonCode)) fail("INVALID_INPUT", "Motif de demande invalide.");

    const patient = await Patient.exists({ _id: patientId, ownerUserId: authUser.userId });
    if (!patient) fail("NOT_FOUND", "Dossier introuvable.");

    const duplicate = await ClinicalSupportAccessRequest.findOne({
        patientId,
        physicianUserId: authUser.userId,
        $or: [
            { status: { $in: ["OPEN", "PENDING"] } },
            { status: "APPROVED", expiresAt: { $gt: new Date() } },
        ],
    }).lean();
    if (duplicate) fail("REQUEST_ALREADY_PENDING", "Une demande de soutien est deja active pour ce dossier.");

    return ClinicalSupportAccessRequest.create({ patientId, physicianUserId: authUser.userId, reasonCode, status: "OPEN" });
}

export async function listOpenClinicalSupportRequests(authUser) {
    if (authUser?.role !== "SUPERADMIN") fail("FORBIDDEN", "Action reservee au SUPERADMIN.");
    const rows = await ClinicalSupportAccessRequest.find({ status: "OPEN" }).sort({ createdAt: 1 }).lean();
    return rows.map((row) => ({ id: String(row._id), patientId: String(row.patientId), reasonCode: row.reasonCode, requestedAt: row.createdAt }));
}

export async function claimClinicalSupportRequest({ requestId, justificationCode, authUser }) {
    if (authUser?.role !== "SUPERADMIN") fail("FORBIDDEN", "Action reservee au SUPERADMIN.");
    if (!mongoose.Types.ObjectId.isValid(requestId)) fail("INVALID_INPUT", "Identifiant de demande invalide.");
    if (!REASON_CODES.has(justificationCode)) fail("INVALID_INPUT", "Motif de justification invalide.");
    const request = await ClinicalSupportAccessRequest.findOneAndUpdate(
        { _id: requestId, status: "OPEN", requestedByUserId: null },
        { $set: { requestedByUserId: authUser.userId, superadminJustificationCode: justificationCode, status: "PENDING" } },
        { new: true }
    );
    if (!request) fail("NOT_FOUND", "Demande de soutien indisponible.");
    return request;
}

export async function listPendingClinicalSupportRequests(authUser) {
    if (authUser?.role !== "MEDECIN") fail("FORBIDDEN", "Action reservee au medecin proprietaire du dossier.");
    const rows = await ClinicalSupportAccessRequest.find({ physicianUserId: authUser.userId, status: "PENDING" })
        .sort({ createdAt: -1 }).lean();
    return rows.map((row) => ({
        id: String(row._id), patientId: String(row.patientId), reasonCode: row.reasonCode, superadminJustificationCode: row.superadminJustificationCode, requestedAt: row.createdAt,
    }));
}

export async function listActiveClinicalSupportAccessRequests(authUser) {
    if (authUser?.role !== "MEDECIN") fail("FORBIDDEN", "Action reservee au medecin proprietaire du dossier.");
    const rows = await ClinicalSupportAccessRequest.find({
        physicianUserId: authUser.userId,
        status: "APPROVED",
        expiresAt: { $gt: new Date() },
    }).sort({ expiresAt: 1 }).lean();
    return rows.map((row) => ({
        id: String(row._id),
        patientId: String(row.patientId),
        reasonCode: row.reasonCode,
        expiresAt: row.expiresAt,
    }));
}

export async function listPhysicianClinicalSupportRequestStatuses(authUser) {
    if (authUser?.role !== "MEDECIN") fail("FORBIDDEN", "Action reservee au medecin proprietaire du dossier.");

    const rows = await ClinicalSupportAccessRequest.find({
        physicianUserId: authUser.userId,
        $or: [
            { status: { $in: ["OPEN", "PENDING"] } },
            { status: "APPROVED", expiresAt: { $gt: new Date() } },
        ],
    }).lean();

    return rows.map((row) => ({
        patientId: String(row.patientId),
        status: row.status,
    }));
}

export async function listOwnActiveClinicalSupportAccessRequests(authUser) {
    if (authUser?.role !== "SUPERADMIN") fail("FORBIDDEN", "Action reservee au SUPERADMIN.");
    const rows = await ClinicalSupportAccessRequest.find({
        requestedByUserId: authUser.userId,
        status: "APPROVED",
        expiresAt: { $gt: new Date() },
    }).sort({ expiresAt: 1 }).lean();
    return rows.map((row) => ({
        id: String(row._id),
        patientId: String(row.patientId),
        reasonCode: row.reasonCode,
        expiresAt: row.expiresAt,
    }));
}

export async function decideClinicalSupportAccessRequest({ requestId, decision, durationMinutes, authUser }) {
    if (authUser?.role !== "MEDECIN") fail("FORBIDDEN", "Action reservee au medecin proprietaire du dossier.");
    if (!mongoose.Types.ObjectId.isValid(requestId)) fail("INVALID_INPUT", "Identifiant de demande invalide.");
    if (!["APPROVE", "REJECT"].includes(decision)) fail("INVALID_INPUT", "Decision invalide.");

    const request = await ClinicalSupportAccessRequest.findOne({
        _id: requestId,
        physicianUserId: authUser.userId,
        status: "PENDING",
    });
    if (!request) fail("NOT_FOUND", "Demande d'acces introuvable.");

    if (decision === "APPROVE") {
        const minutes = Number(durationMinutes);
        if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) {
            fail("INVALID_INPUT", "La duree d'acces doit etre comprise entre 5 et 60 minutes.");
        }
        request.status = "APPROVED";
        request.approvedAt = new Date();
        request.approvedByUserId = authUser.userId;
        request.expiresAt = new Date(Date.now() + minutes * 60_000);
    } else {
        request.status = "REJECTED";
        request.revokedAt = new Date();
    }

    await request.save();
    return request;
}

export async function getActiveDelegatedPatientAccess(patientId, authUser) {
    if (authUser?.role !== "SUPERADMIN") return null;
    const now = new Date();
    const active = await ClinicalSupportAccessRequest.findOne({
        patientId,
        requestedByUserId: authUser.userId,
        status: "APPROVED",
        expiresAt: { $gt: now },
    }).lean();
    if (active) return active;

    const expired = await ClinicalSupportAccessRequest.findOneAndUpdate(
        { patientId, requestedByUserId: authUser.userId, status: "APPROVED", expiresAt: { $lte: now } },
        { $set: { status: "EXPIRED" } },
        { new: true }
    ).lean();
    if (expired) {
        await recordWriteOperationAuditEvent({
            collectionName: "clinicalsupportaccessrequests", operation: "UPDATE", outcome: "SUCCESS",
            actorUserId: authUser.userId, actorUsername: authUser.username, actorRole: authUser.role,
            resourceId: String(expired._id), patientId: String(expired.patientId), changedFields: ["status"],
        });
    }
    return null;
}

export async function revokeClinicalSupportAccessRequest({ requestId, authUser }) {
    if (authUser?.role !== "MEDECIN") fail("FORBIDDEN", "Action reservee au medecin proprietaire du dossier.");
    if (!mongoose.Types.ObjectId.isValid(requestId)) fail("INVALID_INPUT", "Identifiant de demande invalide.");
    const request = await ClinicalSupportAccessRequest.findOne({
        _id: requestId,
        physicianUserId: authUser.userId,
        status: "APPROVED",
        expiresAt: { $gt: new Date() },
    });
    if (!request) fail("NOT_FOUND", "Autorisation active introuvable.");
    request.status = "REVOKED";
    request.revokedAt = new Date();
    await request.save();
    return request;
}
