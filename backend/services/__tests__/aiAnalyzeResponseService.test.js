import { describe, expect, it, vi } from "vitest";

import {
    buildDegradedAnalyzeResponse,
    buildMockAnalyzeResponse,
    buildPersistedRealAnalyzeResponse,
} from "../aiAnalyzeResponseService.js";

describe("aiAnalyzeResponseService", () => {
    it("builds and persists a mock response payload", async () => {
        const persistOrReuseDiagnosis = vi.fn().mockResolvedValue({
            ok: true,
            writeAuditRecorded: true,
            doc: {
                output: { diagnosis: { suspected: "Mock diagnosis" } },
            },
        });

        const result = await buildMockAnalyzeResponse({
            diagnosisSeed: "headache",
            diagnosis: "Migraine",
            fingerprint: "fp-1",
            patient: {},
            neutralizationMeta: { neutralized: true },
            getMockForDiagnosis: vi.fn(() => ({
                diagnosis: { suspected: "Mock diagnosis" },
            })),
            normalizeClinicalAnalysis: vi.fn((value) => value),
            persistOrReuseDiagnosis,
            writeVerification: {
                verificationId: "WRV-TEST-MOCK",
                clientMutationId: "mock-client-1",
            },
            reverifyRequested: true,
            reqAuth: {
                userId: "super-1",
                username: "root",
                role: "SUPERADMIN",
            },
        });

        expect(result).toEqual({
            ok: true,
            responsePayload: {
                data: { diagnosis: { suspected: "Mock diagnosis" } },
                meta: {
                    source: "mock",
                    model: "mock",
                    reverified: true,
                    writeVerification: {
                        status: "CONFIRMED",
                        verificationId: "WRV-TEST-MOCK",
                        clientMutationId: "mock-client-1",
                    },
                    neutralized: true,
                },
            },
        });
        expect(persistOrReuseDiagnosis).toHaveBeenCalledWith(
            expect.objectContaining({
                replaceExisting: true,
                archiveExistingAsDeleted: true,
                archivedBy: {
                    userId: "super-1",
                    username: "root",
                    role: "SUPERADMIN",
                },
            })
        );
    });

    it("builds a degraded fallback response", () => {
        const result = buildDegradedAnalyzeResponse({
            diagnosis: "Migraine",
            neutralizationMeta: { neutralized: true },
            normalizeClinicalAnalysis: vi.fn((value, meta) => ({
                ...value,
                primaryConcern: meta.primaryConcern,
            })),
        });

        expect(result).toEqual({
            data: { primaryConcern: "Migraine" },
            meta: {
                source: "degraded",
                model: "fallback",
                neutralized: true,
            },
        });
    });

    it("persists and shapes a real OpenAI response payload", async () => {
        const logger = { log: vi.fn() };
        const persistOrReuseDiagnosis = vi.fn().mockResolvedValue({
            ok: true,
            writeAuditRecorded: true,
            doc: {
                output: { diagnosis: { suspected: "Migraine" } },
            },
        });

        const result = await buildPersistedRealAnalyzeResponse({
            fingerprint: "fp-1",
            patient: {},
            normalized: { diagnosis: { suspected: "Migraine" } },
            model: "gpt-4.1-mini",
            forceRealSafe: false,
            neutralizationMeta: null,
            persistOrReuseDiagnosis,
            writeVerification: {
                verificationId: "WRV-TEST-REAL",
                clientMutationId: "real-client-1",
            },
            logger,
        });

        expect(result).toEqual({
            ok: true,
            responsePayload: {
                data: { diagnosis: { suspected: "Migraine" } },
                meta: {
                    source: "real",
                    model: "gpt-4.1-mini",
                    writeVerification: {
                        status: "CONFIRMED",
                        verificationId: "WRV-TEST-REAL",
                        clientMutationId: "real-client-1",
                    },
                },
            },
        });
        expect(logger.log).toHaveBeenCalledWith(
            "AI_RESPONSE_READY",
            expect.objectContaining({
                model: "gpt-4.1-mini",
                responseBytes: expect.any(Number),
                writeVerificationRecorded: true,
            })
        );
        expect(JSON.stringify(logger.log.mock.calls)).not.toContain("Migraine");
    });
});
