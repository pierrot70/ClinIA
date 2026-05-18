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
        });

        expect(result).toEqual({
            ok: true,
            responsePayload: {
                data: { diagnosis: { suspected: "Mock diagnosis" } },
                meta: {
                    source: "mock",
                    model: "mock",
                    neutralized: true,
                },
            },
        });
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
            logger,
        });

        expect(result).toEqual({
            ok: true,
            responsePayload: {
                data: { diagnosis: { suspected: "Migraine" } },
                meta: {
                    source: "real",
                    model: "gpt-4.1-mini",
                },
            },
        });
        expect(logger.log).toHaveBeenCalled();
    });
});
