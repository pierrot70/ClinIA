import { describe, expect, it } from "vitest";

import {
    buildFingerprintPatientPayload,
    resolveCachedDiagnosisState,
} from "../aiAnalyzeCacheService.js";

describe("aiAnalyzeCacheService", () => {
    const extractPrimaryClinicalConcern = ({ diagnosis, symptoms }) =>
        diagnosis || symptoms?.[0] || "";
    const normalizeClinicalAnalysis = (output, { model, primaryConcern }) => ({
        ...output,
        modelUsed: model,
        primaryConcern,
    });
    const isPlaceholderClinicalAnalysis = (output) =>
        output?.diagnosis?.suspected === "To be determined";

    it("allows reuse of a meaningful cached diagnosis and marks cache upgrade when normalized output changes", () => {
        const result = resolveCachedDiagnosisState({
            cachedDiagnosis: {
                input: { diagnosis: "Migraine" },
                output: { diagnosis: { suspected: "Migraine" } },
                mode: "real",
                model: "gpt-4.1-mini",
            },
            model: "gpt-4.1-mini",
            forceRealSafe: false,
            useMock: false,
            extractPrimaryClinicalConcern,
            normalizeClinicalAnalysis,
            isPlaceholderClinicalAnalysis,
        });

        expect(result.cachedDiagnosisIsPlaceholderReal).toBe(false);
        expect(result.canReuseCachedDiagnosis).toBe(true);
        expect(result.cacheNeedsUpgrade).toBe(true);
        expect(result.normalizedCachedOutput).toEqual({
            diagnosis: { suspected: "Migraine" },
            modelUsed: "gpt-4.1-mini",
            primaryConcern: "Migraine",
        });
    });

    it("refuses reuse for placeholder real diagnoses", () => {
        const placeholderResult = resolveCachedDiagnosisState({
            cachedDiagnosis: {
                input: { diagnosis: "Unknown" },
                output: { diagnosis: { suspected: "To be determined" } },
                mode: "real",
                model: "gpt-4.1-mini",
            },
            model: "gpt-4.1-mini",
            forceRealSafe: false,
            useMock: false,
            extractPrimaryClinicalConcern,
            normalizeClinicalAnalysis,
            isPlaceholderClinicalAnalysis,
        });

        expect(placeholderResult.cachedDiagnosisIsPlaceholderReal).toBe(true);
        expect(placeholderResult.canReuseCachedDiagnosis).toBe(false);
    });

    it("removes non-clinical request controls from the fingerprint payload", () => {
        expect(
            buildFingerprintPatientPayload({
                age: 55,
                diagnosis: "Diabete de type 2",
                current_medications: ["Metformine"],
                diabetes_context: { fragility: "Faible" },
                forceReal: false,
                openaiModel: "gpt-4.1-mini",
                incidentAckId: "incident-123",
            })
        ).toEqual({
            age: 55,
            diagnosis: "Diabete de type 2",
            current_medications: ["Metformine"],
            diabetes_context: { fragility: "Faible" },
        });
    });
});
