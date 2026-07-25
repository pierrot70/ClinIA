import { describe, expect, it, vi } from "vitest";
import {
    getSafeErrorMetadata,
    getSafeRequestPath,
    logSafeError,
} from "../requestLogSafety.js";

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

describe("logSafeError", () => {
    it("does not write error messages, stacks, URLs or arbitrary context", () => {
        const logger = { error: vi.fn() };
        const canary = "Pierre Lasante RAMQ1234567890 pierre@example.com";
        const error = Object.assign(new Error(canary), {
            code: "MONGO_WRITE_FAILED",
            stack: `Error: ${canary} at https://example.invalid/patients/secret`,
        });

        logSafeError("PATIENT_UPDATE_FAILED", error, {
            logger,
            requestId: "550e8400-e29b-41d4-a716-446655440000",
            operation: "update",
            patientName: canary,
        });

        expect(logger.error).toHaveBeenCalledWith("CLINIA_SAFE_ERROR", {
            event: "PATIENT_UPDATE_FAILED",
            name: "Error",
            code: "MONGO_WRITE_FAILED",
            requestId: "550e8400-e29b-41d4-a716-446655440000",
            operation: "update",
        });
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain(canary);
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain("example.invalid");
    });

    it("drops untrusted error names and codes", () => {
        expect(
            getSafeErrorMetadata({
                name: "Pierre Lasante",
                code: "RAMQ1234567890",
            })
        ).toEqual({ name: "Error", code: null });
    });
});
