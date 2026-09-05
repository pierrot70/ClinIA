import { describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({ listConsultations: vi.fn(), readConsultation: vi.fn(), addConsultationNote: vi.fn(), acceptPatientCare: vi.fn() }));
vi.mock("../../services/consultations.js", () => services);
import router from "../consultations.js";

const handler = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const request = () => ({ params: { appointmentId: "appointment" }, auth: { userId: "doctor", role: "MEDECIN" }, headers: {}, body: {} });
const response = () => ({ set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() });
describe("consultation API contract", () => {
    it("does not register note update or delete endpoints", () => {
        expect(router.stack.filter(layer => layer.route).every(layer => !layer.route.methods.put && !layer.route.methods.patch && !layer.route.methods.delete)).toBe(true);
    });
    it.each([["FORBIDDEN", 403], ["INVALID_INPUT", 400], ["CARE_ALREADY_ASSIGNED", 409], ["unexpected-sensitive-error", 500]])("returns a safe %s response", async (code, status) => {
        services.readConsultation.mockRejectedValue({ code, message: "private-content", stack: "private-stack" });
        const res = response();
        await handler("/:appointmentId", "get")(request(), res);
        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(JSON.stringify(res.json.mock.calls)).not.toContain("private");
    });
    it("ignores client-supplied patient and note author", async () => {
        services.addConsultationNote.mockResolvedValue({ _id: "note" });
        const req = request();
        req.body = { note: "New note", patientId: "arbitrary", authorUserId: "other-doctor", ownerUserId: "other-doctor" };
        const res = response();
        await handler("/:appointmentId/notes", "post")(req, res);
        expect(services.addConsultationNote).toHaveBeenCalledWith("appointment", "New note", req.auth, expect.anything());
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
