import { describe, expect, it, vi } from "vitest";
import { getMockForDiagnosis } from "../../utils/mockLoader.js";
import { normalizeClinicalAnalysis } from "../../utils/clinicalAnalysis.js";

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

    it("returns an anonymous demo response without persisting it", async () => {
        const persistOrReuseDiagnosis = vi.fn();

        const result = await buildMockAnalyzeResponse({
            diagnosisSeed: "headache",
            diagnosis: "Migraine",
            fingerprint: "fp-anonymous",
            patient: { diagnosis: "Migraine" },
            neutralizationMeta: null,
            getMockForDiagnosis: vi.fn(() => ({
                diagnosis: { suspected: "Migraine" },
            })),
            normalizeClinicalAnalysis: vi.fn((value) => value),
            persistOrReuseDiagnosis,
            persist: false,
        });

        expect(result).toEqual({
            ok: true,
            responsePayload: {
                data: { diagnosis: { suspected: "Migraine" } },
                meta: {
                    source: "mock",
                    model: "mock",
                    ephemeral: true,
                },
            },
        });
        expect(persistOrReuseDiagnosis).not.toHaveBeenCalled();
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


describe("simulated primary concern selection", () => {
    it("selects diabetes despite nonspecific symptoms and preserves submitted context", async () => {
        const patient = { diagnosis: "Type 2 diabetes", symptoms: ["Polydipsia", "Polyuria", "Fatigue"] };
        const snapshot = JSON.stringify(patient);
        const persistOrReuseDiagnosis = vi.fn(async payload => ({ ok: true, doc: { output: payload.output } }));
        const result = await buildMockAnalyzeResponse({
            diagnosis: patient.diagnosis, diagnosisSeed: patient.symptoms.join(" "),
            fingerprint: "synthetic-diabetes", patient, neutralizationMeta: null,
            getMockForDiagnosis, normalizeClinicalAnalysis, persistOrReuseDiagnosis,
        });
        expect(result.responsePayload.data.treatments.map(treatment => treatment.name)).toContain("Metformin");
        const authoredMetformin = getMockForDiagnosis(patient.diagnosis).treatments.find(treatment => treatment.name === "Metformin");
        const normalizedMetformin = result.responsePayload.data.treatments.find(treatment => treatment.name === "Metformin");
        expect(authoredMetformin.justification).toBe("First-line treatment.");
        expect(normalizedMetformin.justification).toBe(authoredMetformin.justification);
        expect(normalizedMetformin.indication).toBe("");
        expect(result.responsePayload.data.diagnosis.suspected).toBe("Type 2 diabetes");
        expect(persistOrReuseDiagnosis).toHaveBeenCalledWith(expect.objectContaining({ input: patient, mode: "mock" }));
        expect(JSON.stringify(patient)).toBe(snapshot);
    });

    it("does not let a conflicting symptom seed override the supplied diagnosis", async () => {
        const selectMock = vi.fn(getMockForDiagnosis);
        const result = await buildMockAnalyzeResponse({
            diagnosis: "  Type 2 diabetes  ", diagnosisSeed: "Migraine", patient: {},
            getMockForDiagnosis: selectMock, normalizeClinicalAnalysis, persist: false,
        });
        expect(selectMock).toHaveBeenCalledWith("Type 2 diabetes");
        expect(result.responsePayload.data.treatments.map(treatment => treatment.name)).toContain("Metformin");
    });

    it.each([undefined, "", "   "])("retains symptom-only selection without a diagnosis: %j", async diagnosis => {
        const selectMock = vi.fn(getMockForDiagnosis);
        const result = await buildMockAnalyzeResponse({
            diagnosis, diagnosisSeed: "Hypertension", patient: {},
            getMockForDiagnosis: selectMock, normalizeClinicalAnalysis, persist: false,
        });
        expect(selectMock).toHaveBeenCalledWith("Hypertension");
        expect(result.responsePayload.data.treatments.length).toBeGreaterThan(0);
    });
});
