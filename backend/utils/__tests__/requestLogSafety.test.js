import { describe, expect, it } from "vitest";
import { getSafeRequestPath } from "../requestLogSafety.js";

describe("getSafeRequestPath", () => {
    it("removes query strings and fragments", () => {
        expect(
            getSafeRequestPath({
                originalUrl: "/api/patients?page=2&email=patient@example.com#details",
            })
        ).toBe("/api/patients");
    });

    it("redacts Mongo and UUID path identifiers", () => {
        expect(
            getSafeRequestPath({
                originalUrl:
                    "/api/patients/507f1f77bcf86cd799439011/documents/550e8400-e29b-41d4-a716-446655440000",
            })
        ).toBe("/api/patients/:id/documents/:id");
    });

    it("uses the mounted route without query data when available", () => {
        expect(
            getSafeRequestPath({
                baseUrl: "/api/appointments",
                path: "/slots",
                originalUrl: "/api/appointments/slots?date=2026-07-18",
            })
        ).toBe("/api/appointments/slots");
    });
});
