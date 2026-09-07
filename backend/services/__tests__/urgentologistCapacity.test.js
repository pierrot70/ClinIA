import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ count: vi.fn(), lock: vi.fn(), sessionCount: vi.fn() }));
vi.mock("../../models/Appointment.js", () => ({ Appointment: { countDocuments: mocks.count } }));
vi.mock("../../models/Specialist.js", () => ({ Specialist: { updateOne: mocks.lock } }));
import { countUrgentologistConsultations, reserveUrgentologistCapacity } from "../urgentologistCapacity.js";
import { assertUrgentologistAvailability, isUrgentologist, resolveUrgentologistDailyLimit } from "../../domain/specialties.js";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("temporary local one-consultation limit", () => {
    it("only allows the override in development", () => {
        expect(resolveUrgentologistDailyLimit({ NODE_ENV: "development", CLINIA_TEST_URGENTOLOGIST_LIMIT: "1" })).toBe(1);
        for (const NODE_ENV of ["production", "test", undefined]) {
            expect(resolveUrgentologistDailyLimit({ NODE_ENV, CLINIA_TEST_URGENTOLOGIST_LIMIT: "1" })).toBe(20);
        }
        expect(resolveUrgentologistDailyLimit({ NODE_ENV: "development" })).toBe(20);
        expect(resolveUrgentologistDailyLimit({ NODE_ENV: "development", CLINIA_TEST_URGENTOLOGIST_LIMIT: "20" })).toBe(20);
    });
    it("allows the first consultation and refuses the second at the temporary limit", async () => {
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("CLINIA_TEST_URGENTOLOGIST_LIMIT", "1");
        vi.resetModules();
        const { reserveUrgentologistCapacity: reserve } = await import("../urgentologistCapacity.js");
        mocks.sessionCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
        await expect(reserve("doctor", "2099-01-01", { session: {} })).resolves.toBeUndefined();
        await expect(reserve("doctor", "2099-01-01", { session: {} })).rejects.toMatchObject({ code: "MAXIMUM_APPOINTMENTS_REACHED", message: expect.stringContaining("(1)") });
    });
});

beforeEach(() => {
    vi.resetAllMocks();
    mocks.count.mockReturnValue({ session: mocks.sessionCount });
    mocks.sessionCount.mockResolvedValue(19);
    mocks.lock.mockResolvedValue({ modifiedCount: 1 });
});
describe("urgentologist consultation capacity", () => {
    it("counts appointments, including completed, across clinics without grouping patients", async () => {
        await countUrgentologistConsultations("doctor", "2099-01-01");
        expect(mocks.count).toHaveBeenCalledWith({ specialist: "doctor", date: "2099-01-01", status: { $in: ["scheduled", "completed"] } });
    });
    it("locks the physician before allowing consultation 20 in the same transaction", async () => {
        const session = {};
        await reserveUrgentologistCapacity("doctor", "2099-01-01", { session });
        expect(mocks.lock).toHaveBeenCalledWith({ _id: "doctor" }, { $inc: { __v: 1 } }, { session });
        expect(mocks.sessionCount).toHaveBeenCalledWith(session);
        expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.count.mock.invocationCallOrder[0]);
    });
    it.each([20, 21])("rejects another consultation when %s already count", async count => {
        mocks.sessionCount.mockResolvedValue(count);
        await expect(reserveUrgentologistCapacity("doctor", "2099-01-01", { session: {} })).rejects.toMatchObject({ code: "MAXIMUM_APPOINTMENTS_REACHED" });
    });
    it("excludes only the appointment being replaced, not every visit by that patient", async () => {
        await reserveUrgentologistCapacity("doctor", "2099-01-01", { session: {}, excludeAppointmentId: "original" });
        expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({ _id: { $ne: "original" } }));
    });
    it("fails closed without a transaction", async () => {
        await expect(reserveUrgentologistCapacity("doctor", "2099-01-01")).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(mocks.count).not.toHaveBeenCalled();
    });
    it("fails closed if the physician disappears", async () => {
        mocks.lock.mockResolvedValue({ modifiedCount: 0 });
        await expect(reserveUrgentologistCapacity("doctor", "2099-01-01", { session: {} })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });
});
describe("walk-in-only specialty", () => {
    it("recognizes the specialty independent of case", () => expect(isUrgentologist("URGENTOLOGUE")).toBe(true));
    it.each([{ disponibilites: ["slot"] }, { practiceLocations: [{ disponibilites: ["slot"] }] }])("rejects regular availability: %j", fields => {
        expect(() => assertUrgentologistAvailability({ specialite: "Urgentologue", ...fields })).toThrow();
    });
    it("permits walk-in availability and preserves other specialties", () => {
        expect(() => assertUrgentologistAvailability({ specialite: "Urgentologue", walkInDisponibilites: ["slot"] })).not.toThrow();
        expect(() => assertUrgentologistAvailability({ specialite: "Médecine familiale", disponibilites: ["slot"] })).not.toThrow();
    });
});
