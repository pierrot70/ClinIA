import { describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({
    createWalkInPatientAndAppointment: vi.fn(), createWalkInAppointmentForExistingPatient: vi.fn(),
    findReceptionPatientByRamq: vi.fn(), listWalkInFamilyMedicineOptions: vi.fn(),
}));
vi.mock("../../services/reception.js", () => services);
import router from "../reception.js";

describe("reception booking response", () => {
    it("passes explicit replacement to the service and returns a conflict when it is stale", async () => {
        const handler = router.stack.find(layer => layer.route?.path === "/walk-in-bookings").route.stack.at(-1).handle;
        services.createWalkInAppointmentForExistingPatient.mockRejectedValue({ code: "RECEPTION_REPLAN_REQUIRED", message: "Refresh selection." });
        const req = { body: { patientId: "patient", replaceAppointmentId: "old", specialist: "doctor", clinic: "clinic", date: "2030-01-01", time: "08:15" }, auth: { userId: "reception" }, headers: {} };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await handler(req, res);
        expect(services.createWalkInAppointmentForExistingPatient).toHaveBeenCalledWith(expect.objectContaining({ patientId: "patient", replaceAppointmentId: "old" }));
        expect(res.status).toHaveBeenCalledWith(409);
    });
    it("returns 409 when the receiving physician has no active account", async () => {
        const handler = router.stack.find(layer => layer.route?.path === "/walk-in-bookings").route.stack.at(-1).handle;
        services.createWalkInAppointmentForExistingPatient.mockRejectedValue({ code: "RECEIVING_PHYSICIAN_UNAVAILABLE", message: "Choose another active physician." });
        const req = { body: { patientId: "patient-test", specialist: "specialist-test", clinic: "clinic-test", date: "2030-01-01", time: "09:00" }, auth: { userId: "reception-test" }, headers: {}, originalUrl: "/api/reception/walk-in-bookings" };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({ error: { code: "RECEIVING_PHYSICIAN_UNAVAILABLE", message: "Choose another active physician.", retryable: false } });
    });
});
