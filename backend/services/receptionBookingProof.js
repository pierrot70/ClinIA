import { createHash, randomBytes } from "node:crypto";
import { ReceptionBookingProof } from "../models/ReceptionBookingProof.js";
import { CLINICAL_WRITE_CONCERN } from "../db/clinicalWriteConcern.js";

const hash = token => createHash("sha256").update(token).digest("hex");
const denied = () => ({ code: "RECEPTION_LOOKUP_REQUIRED", message: "Recherchez à nouveau le patient par son numéro d’assurance maladie avant de poursuivre." });
function binding({ authUser, clinicId, patientId }) {
    if (!authUser?.userId || typeof authUser.sessionId !== "string" || !authUser.sessionId.trim()) throw denied();
    return { userId: authUser.userId, sessionId: authUser.sessionId, clinicId, patientId };
}

// Only a hash is retained: no RAMQ, identity, or reusable bearer secret.
export async function issueReceptionBookingProof({ session = null, ...context }) {
    const scope = binding(context);
    const token = randomBytes(32).toString("hex");
    await ReceptionBookingProof.create([{ ...scope, tokenHash: hash(token), expiresAt: new Date(Date.now() + 10 * 60 * 1000) }], session ? { session } : { writeConcern: CLINICAL_WRITE_CONCERN });
    return token;
}

// Deletion and booking commit together. A concurrent replay cannot commit;
// an aborted booking restores the proof so the user can choose another slot.
export async function consumeReceptionBookingProof({ bookingProof, session, ...context }) {
    const scope = binding(context);
    if (typeof bookingProof !== "string" || !/^[a-f0-9]{64}$/.test(bookingProof)) throw denied();
    const result = await ReceptionBookingProof.deleteOne({ ...scope, tokenHash: hash(bookingProof), expiresAt: { $gt: new Date() } }, { session });
    if (result.deletedCount !== 1) throw denied();
}


// Read-only access to the narrowly scoped historical attendance list. The
// same proof remains available for the eventual transactional booking.
export async function validateReceptionBookingProof({ bookingProof, session = null, ...context }) {
    const scope = binding(context);
    if (typeof bookingProof !== "string" || !/^[a-f0-9]{64}$/.test(bookingProof)) throw denied();
    const found = await ReceptionBookingProof.exists({ ...scope, tokenHash: hash(bookingProof), expiresAt: { $gt: new Date() } }).session(session);
    if (!found) throw denied();
}
