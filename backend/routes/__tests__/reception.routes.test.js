import { beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({
    createWalkInPatientAndAppointment: vi.fn(), createWalkInAppointmentForExistingPatient: vi.fn(),
    findReceptionPatientByRamq: vi.fn(), listWalkInFamilyMedicineOptions: vi.fn(),
    listReceptionHistoricalAppointments: vi.fn(), recordReceptionHistoricalAttendance: vi.fn(),
}));
const replica = vi.hoisted(() => ({ getStatus: vi.fn() }));
vi.mock("../../services/dbStatus.js", () => ({ getReplicaSetStatus: replica.getStatus }));
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


describe("genuine WalkIn write verification response", () => {
    const handler = router.stack.find(layer => layer.route?.path === "/walk-in-bookings").route.stack.at(-1).handle;
    const snapshot = { summary: { status: "OK", memberCount: 3, healthyCount: 3, primaryCount: 1, secondaryCount: 2, majorityAvailable: true, maxLagSeconds: 0 } };
    const result = { patient: { _id: "patient-test" }, appointment: { _id: "appointment-test" }, writeAuditRecorded: true };
    const request = (existing = true) => ({
        body: { specialist: "doctor-test", clinic: "clinic-test", date: "2030-01-01", time: "09:00",
            verificationId: "WRV-FORGED-BY-CLIENT",
            ...(existing ? { patientId: "patient-test" } : { patient: { nom: "Synthetic", prenom: "Fixture", num_assurance_maladie: "TEST12345678", country: "CA", healthInsuranceJurisdiction: "QC", language: "fr" } }) },
        auth: { userId: "reception-test", username: "synthetic-reception", role: "RECEPTION" },
        headers: { "x-client-mutation-id": "synthetic-mutation" },
        requestContext: { requestId: "request-test", instanceId: "instance-test" },
        originalUrl: "/api/reception/walk-in-bookings",
    });
    const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
    beforeEach(() => {
        vi.clearAllMocks();
        replica.getStatus.mockResolvedValue(snapshot);
        services.createWalkInAppointmentForExistingPatient.mockResolvedValue(result);
        services.createWalkInPatientAndAppointment.mockResolvedValue(result);
    });

    it.each([true, false])("returns committed verification metadata for %s existing-patient path", async existing => {
        const res = response(); await handler(request(existing), res);
        expect(res.status).toHaveBeenCalledWith(201);
        const calledService = existing ? services.createWalkInAppointmentForExistingPatient : services.createWalkInPatientAndAppointment;
        const audit = calledService.mock.calls[0][0].audit;
        expect(audit.verificationId).toMatch(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/);
        expect(audit.verificationId).not.toBe("WRV-FORGED-BY-CLIENT");
        expect(audit).toMatchObject({ clientMutationId: "synthetic-mutation", actorUserId: "reception-test", replicaSet: snapshot,
            writeConcern: { w: "majority", j: true, wtimeout: 5000 }, requestId: "request-test", instanceId: "instance-test" });
        expect(replica.getStatus).toHaveBeenCalledExactlyOnceWith();
        expect(res.json).toHaveBeenCalledWith({ data: { patient: result.patient, appointment: result.appointment },
            meta: { source: "real", model: "mongo", writeVerification: { status: "CONFIRMED", verificationId: audit.verificationId, clientMutationId: "synthetic-mutation" } } });
    });

    it("generates distinct server verification IDs for separate requests even with the same client correlation", async () => {
        await handler(request(), response()); await handler(request(), response());
        const ids = services.createWalkInAppointmentForExistingPatient.mock.calls.map(([args]) => args.audit.verificationId);
        expect(ids[0]).not.toBe(ids[1]);
    });

    it.each(["RECEPTION_REPLAN_REQUIRED", "SYNTHETIC_COMMIT_FAILED"])("never reports a confirmed receipt when booking fails (%s)", async code => {
        services.createWalkInAppointmentForExistingPatient.mockRejectedValueOnce({ code });
        const res = response(); await handler(request(), res);
        expect(res.status).toHaveBeenCalledWith(code === "RECEPTION_REPLAN_REQUIRED" ? 409 : 500);
        expect(res.json.mock.calls[0][0].meta).toBeUndefined();
        expect(res.json.mock.calls[0][0].data).toBeUndefined();
    });

    it("does not claim confirmation when the service does not confirm the audit", async () => {
        services.createWalkInAppointmentForExistingPatient.mockResolvedValueOnce({ ...result, writeAuditRecorded: false });
        const res = response(); await handler(request(), res);
        expect(res.json.mock.calls[0][0].meta.writeVerification).toEqual({ status: "UNAVAILABLE", verificationId: null, clientMutationId: "synthetic-mutation" });
    });
});


describe("reception scheduling day is selected by the server", () => {
    it("returns the minimized history signal without forwarding a forged lookup clock", async () => {
        services.findReceptionPatientByRamq.mockClear();
        const result = { _id: "patient-test", nom: "Synthetic", prenom: "Only", bookingProof: "proof", existingAppointments: [], hasHistoricalScheduledAppointments: true };
        services.findReceptionPatientByRamq.mockResolvedValueOnce(result);
        const handler = router.stack.find(layer => layer.route?.path === "/patient-lookup").route.stack.at(-1).handle;
        const req = { query: { clinic: "clinic-test", ramq: "TEST0001", now: "2099-01-01", today: "2099-01-01" }, auth: { userId: "reception-test", role: "RECEPTION" }, headers: {}, originalUrl: "/api/reception/patient-lookup?ramq=TEST0001" };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn().mockReturnThis() };
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(res.json.mock.calls[0][0].data).toEqual(result);
        expect(services.findReceptionPatientByRamq.mock.calls[0][0]).not.toHaveProperty("now");
        expect(services.findReceptionPatientByRamq.mock.calls[0][0]).not.toHaveProperty("today");
    });
    it("does not forward a forged availability clock", async () => {
        services.listWalkInFamilyMedicineOptions.mockClear();
        services.listWalkInFamilyMedicineOptions.mockResolvedValueOnce({ today: [], future: [] });
        const handler = router.stack.find(layer => layer.route?.path === "/walk-in-options").route.stack.at(-1).handle;
        const auth = { userId: "reception-test", role: "RECEPTION" };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await handler({ query: { clinic: "clinic-test", patient: "patient-test", replaceAppointmentId: "old-test", now: "2099-01-01" }, auth }, res);
        expect(services.listWalkInFamilyMedicineOptions).toHaveBeenCalledExactlyOnceWith({ clinicId: "clinic-test", patientId: "patient-test", replaceAppointmentId: "old-test", authUser: auth });
    });
});


describe("proof-scoped administrative attendance API", () => {
    const queryHandler = router.stack.find(layer => layer.route?.path === "/historical-appointments/query").route.stack.at(-1).handle;
    const writeHandler = router.stack.find(layer => layer.route?.path === "/historical-appointments/:id/attendance").route.stack.at(-1).handle;
    const auth = { userId: "reception-test", role: "RECEPTION", sessionId: "session-test" };
    const request = outcome => ({ body: { clinic: "clinic-test", patientId: "patient-test", bookingProof: "proof-test", outcome },
        params: { id: "appointment-test" }, auth, ip: "127.0.0.1", headers: {}, requestContext: { requestId: "request-test", instanceId: "instance-test" } });
    const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn().mockReturnThis() });
    beforeEach(() => { vi.clearAllMocks(); replica.getStatus.mockResolvedValue({ summary: { status: "INCIDENT" } }); });

    it("uses a body-only proof and ignores forged clocks or actor IDs for the minimal historical list", async () => {
        const result = { appointments: [{ _id: "appointment-test", date: "2030-01-01", time: "08:00" }], hasMore: false };
        services.listReceptionHistoricalAppointments.mockResolvedValueOnce(result);
        const req = request(); Object.assign(req.body, { now: "2099-01-01", actorUserId: "forged" });
        const res = response(); await queryHandler(req, res);
        expect(services.listReceptionHistoricalAppointments).toHaveBeenCalledExactlyOnceWith({ clinicId: "clinic-test", patientId: "patient-test", bookingProof: "proof-test", authUser: auth, audit: { ip: "127.0.0.1" } });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(res.json).toHaveBeenCalledWith({ data: result, meta: { source: "real", model: "mongo" } });
        expect(replica.getStatus).not.toHaveBeenCalled();
    });
    it.each(["attended", "not_attended"])("returns %s with a genuine per-request WRV and fresh proof after commit", async outcome => {
        const data = { appointment: { _id: "appointment-test", date: "2030-01-01", time: "08:00", attendanceResolution: { outcome } }, bookingProof: "fresh-proof" };
        services.recordReceptionHistoricalAttendance.mockResolvedValueOnce({ ...data, writeAuditRecorded: true });
        const res = response(); await writeHandler(request(outcome), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
        const args = services.recordReceptionHistoricalAttendance.mock.calls[0][0];
        expect(args).toMatchObject({ clinicId: "clinic-test", patientId: "patient-test", appointmentId: "appointment-test", bookingProof: "proof-test", outcome, authUser: auth });
        expect(args.audit).toMatchObject({ verificationId: expect.stringMatching(/^WRV-/), replicaSet: { summary: { status: "INCIDENT" } }, requestId: "request-test", instanceId: "instance-test" });
        expect(res.json).toHaveBeenCalledWith({ data, meta: { source: "real", model: "mongo", writeVerification: { status: "CONFIRMED", verificationId: args.audit.verificationId, clientMutationId: null } } });
    });
    it("generates independent verification IDs for separate attendance requests", async () => {
        services.recordReceptionHistoricalAttendance.mockResolvedValue({ appointment: {}, bookingProof: "fresh", writeAuditRecorded: true });
        await writeHandler(request("attended"), response()); await writeHandler(request("attended"), response());
        const ids = services.recordReceptionHistoricalAttendance.mock.calls.map(([args]) => args.audit.verificationId);
        expect(ids[0]).not.toBe(ids[1]);
    });
    it.each(["status", "notes", "ownerUserId", "verificationId", "recordedAt", "source"])("rejects forged %s rather than interpreting it as administrative attendance", async key => {
        const req = request("attended"); req.body[key] = "forged";
        const res = response(); await writeHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(services.recordReceptionHistoricalAttendance).not.toHaveBeenCalled();
        expect(replica.getStatus).not.toHaveBeenCalled();
    });
    it.each([["RECEPTION_LOOKUP_REQUIRED", 403], ["FORBIDDEN", 403], ["INVALID_INPUT", 400], ["RECEPTION_HISTORY_CONFLICT", 409], ["SYNTHETIC_FAILURE", 500]])("fails closed without a receipt for %s", async (code, status) => {
        services.recordReceptionHistoricalAttendance.mockRejectedValueOnce({ code, message: "synthetic" });
        const res = response(); await writeHandler(request("attended"), res);
        expect(res.status).toHaveBeenCalledWith(status);
        expect(res.json.mock.calls[0][0]).not.toHaveProperty("data");
        expect(res.json.mock.calls[0][0]).not.toHaveProperty("meta");
        if (status === 500) expect(res.json.mock.calls[0][0].error.code).toBe("PERSISTENCE_FAILED");
    });
});
