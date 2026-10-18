import { describe, expect, it } from "vitest";
import { Patient } from "../Patient.js";

const event = {
    reason: "  Synthetic reactivation reason  ", reactivatedAt: new Date("2026-10-18T14:00:00Z"),
    reactivatedByUserId: "507f1f77bcf86cd799439011", verificationId: "WRV-SYNTHETIC",
};
const patient = history => new Patient({ nom: "Synthetic", prenom: "Test", reactivationHistory: history });

describe("patient reactivation history real schema", () => {
    it("retains multiple complete events and trims the reason", async () => {
        const document = patient([event, { ...event, reason: "Second reason", verificationId: "WRV-SECOND" }]);
        await expect(document.validate()).resolves.toBeUndefined();
        expect(document.reactivationHistory.map(e => e.reason)).toEqual(["Synthetic reactivation reason", "Second reason"]);
        expect(document.reactivationHistory[0].reactivatedByUserId.toString()).toBe(event.reactivatedByUserId);
        expect(document.reactivationHistory[0].reactivatedAt).toEqual(event.reactivatedAt);
        expect(document.reactivationHistory[0].verificationId).toBe(event.verificationId);
    });

    it.each([
        { reason: "" }, { reason: "   " }, { reason: "x".repeat(501) },
        { reactivatedAt: null }, { reactivatedByUserId: null }, { reactivatedByUserId: "invalid" },
        { verificationId: "x".repeat(121) },
    ])("rejects an invalid stored event %j", async override => {
        await expect(patient([{ ...event, ...override }]).validate()).rejects.toHaveProperty("name", "ValidationError");
    });

    it("supports older records without history and hides history from ordinary queries", async () => {
        const document = new Patient({ nom: "Synthetic", prenom: "Legacy" });
        await expect(document.validate()).resolves.toBeUndefined();
        expect(document.reactivationHistory).toHaveLength(0);
        expect(Patient.schema.path("reactivationHistory").options.select).toBe(false);
    });
});
