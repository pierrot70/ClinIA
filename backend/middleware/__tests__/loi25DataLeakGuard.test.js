import { describe, expect, it, vi } from "vitest";

import { loi25DataLeakGuard } from "../loi25DataLeakGuard.js";

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe("loi25DataLeakGuard", () => {
    it("does not block local patient CRUD payloads by default", () => {
        const req = {
            body: {
                prenom: "Patient",
                nom: "Pierrot",
            },
            originalUrl: "/api/patients",
            method: "POST",
        };
        const res = makeRes();
        const next = vi.fn();

        loi25DataLeakGuard(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("blocks explicit cloud-bound payloads containing identifiers", () => {
        const req = {
            body: {
                prenom: "Patient",
                nom: "Pierrot",
            },
            originalUrl: "/api/test-cloud",
            method: "POST",
            cliniaCloudSafety: {
                enforce: true,
            },
        };
        const res = makeRes();
        const next = vi.fn();

        loi25DataLeakGuard(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledTimes(1);
        expect(res.json.mock.calls[0][0].error.code).toBe(
            "SECURITY_INCIDENT_BLOCKING"
        );
        expect(res.json.mock.calls[0][0].blocking.incident.phase).toBe(
            "pre_cloud"
        );
    });
});