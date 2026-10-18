import { describe, expect, it } from "vitest";
import { PatientAuditLog } from "../PatientAuditLog.js";

// Use the real Mongoose validators: mocked audit persistence cannot catch
// a route action missing from the persisted action enum.
describe("patient archive lifecycle audit schema", () => {
    it.each(["PATIENT_ARCHIVE", "PATIENT_RESTORE"])("accepts the persisted %s action", async action => {
        const event = new PatientAuditLog({
            action, outcome: "SUCCESS",
            actorUserId: "507f1f77bcf86cd799439011", actorRole: "MEDECIN",
            patientId: "507f1f77bcf86cd799439012", ip: "192.0.2.10",
            changedFields: ["archivedAt", "archivedByUserId", "archiveReason"],
            timestamp: new Date("2026-10-18T13:00:00Z"), context: null,
        });
        await expect(event.validate()).resolves.toBeUndefined();
        expect(event.action).toBe(action);
    });

    it("continues rejecting unknown actions", async () => {
        const event = new PatientAuditLog({ action: "UNKNOWN_ACTION", outcome: "SUCCESS" });
        await expect(event.validate()).rejects.toMatchObject({ errors: { action: { kind: "enum" } } });
    });
});
