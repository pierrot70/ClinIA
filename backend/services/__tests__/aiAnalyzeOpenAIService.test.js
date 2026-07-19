import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { executeOpenAIAnalyze } from "../aiAnalyzeOpenAIService.js";
import { buildCloudSafePatientPayload } from "../../utils/requestSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadUnsafePatientFixture() {
    const fixturePath = path.join(
        __dirname,
        "fixtures",
        "openai-cloud-unsafe-patient.json"
    );

    return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function assertNoForbiddenCloudFields(serializedPayload) {
    const forbiddenMarkers = [
        '"age":',
        '"country":',
        '"ethnicity":',
        '"height":',
        '"blood_pressure":',
        '"forceReal":',
        '"openaiModel":',
        '"incidentAckId":',
        '"reverifyRequested":',
    ];

    const leakedFields = forbiddenMarkers
        .filter((marker) => serializedPayload.includes(marker))
        .map((marker) => marker.replace(/[" :]/g, ""));

    if (leakedFields.length > 0) {
        throw new Error(
            `Des champs invalides ne peuvent etre envoyes a OpenAI: ${leakedFields.join(", ")}`
        );
    }
}

function createResponseDouble() {
    return {
        status: vi.fn(),
        json: vi.fn(),
    };
}

describe("aiAnalyzeOpenAIService", () => {
    it("returns a normalized result after auditing a successful OpenAI request", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const recordOpenAIRequestAuditEvent = vi
            .fn()
            .mockResolvedValue({ _id: "audit-1" });
        const finalizeOpenAIRequestAuditEvent = vi.fn().mockResolvedValue({});
        const recordOpenAISuccess = vi.fn();
        const openai = {
            chat: {
                completions: {
                    create: vi.fn().mockResolvedValue({
                        id: "upstream-1",
                        choices: [
                            {
                                message: {
                                    content: '{"diagnosis":{"suspected":"Migraine"}}',
                                },
                            },
                        ],
                    }),
                },
            },
        };

        const logger = { log: vi.fn(), error: vi.fn() };
        const result = await executeOpenAIAnalyze({
            openai,
            model: "gpt-4.1-mini",
            diagnosis: "Migraine",
            patient: { medical_history: [], current_medications: [] },
            symptoms: ["headache"],
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent,
            finalizeOpenAIRequestAuditEvent,
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Migraine" },
            })),
            normalizeClinicalAnalysis: vi.fn((parsed) => parsed),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess,
            recordOpenAIFailure: vi.fn(),
            res,
            logger,
        });

        expect(result).toEqual({
            ok: true,
            normalized: { diagnosis: { suspected: "Migraine" } },
        });
        expect(recordOpenAIRequestAuditEvent).toHaveBeenCalledTimes(1);
        expect(finalizeOpenAIRequestAuditEvent).toHaveBeenCalledWith("audit-1", {
            outcome: "SUCCESS",
            upstreamRequestId: "upstream-1",
        });
        expect(recordOpenAISuccess).toHaveBeenCalledTimes(1);
        expect(logger.log).toHaveBeenCalledWith(
            "OPENAI_RESPONSE_RECEIVED",
            expect.objectContaining({
                model: "gpt-4.1-mini",
                upstreamRequestId: "upstream-1",
                responseBytes: expect.any(Number),
            })
        );
        expect(JSON.stringify(logger.log.mock.calls)).not.toContain("Migraine");
    });

    it("adds type 2 diabetes comparison guardrails to the OpenAI prompt", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const create = vi.fn().mockResolvedValue({
            id: "upstream-1",
            choices: [
                {
                    message: {
                        content: '{"diagnosis":{"suspected":"Diabete de type 2"}}',
                    },
                },
            ],
        });

        await executeOpenAIAnalyze({
            openai: {
                chat: {
                    completions: { create },
                },
            },
            model: "gpt-4.1-mini",
            diagnosis: "Diabete de type 2",
            patient: { medical_history: [], current_medications: ["Metformine"] },
            symptoms: ["Polydipsie"],
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
            finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Diabete de type 2" },
            })),
            normalizeClinicalAnalysis: vi.fn((parsed) => parsed),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        const request = create.mock.calls[0][0];
        expect(request.messages[0].content).toContain("GLP-1 option may merit reevaluation");
        expect(request.messages[0].content).toContain("Do not recommend prescribing");
        expect(request.messages[1].content).toContain("compare continuing the current strategy");
    });

    it("includes additional type 2 diabetes clinical context in the OpenAI prompt", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const create = vi.fn().mockResolvedValue({
            id: "upstream-1",
            choices: [
                {
                    message: {
                        content: '{"diagnosis":{"suspected":"Diabete de type 2"}}',
                    },
                },
            ],
        });

        await executeOpenAIAnalyze({
            openai: {
                chat: {
                    completions: { create },
                },
            },
            model: "gpt-4.1-mini",
            diagnosis: "Diabete de type 2",
            patient: {
                age_band: "50-59",
                weight_band: "80-99kg",
                medical_history: [],
                current_medications: ["Metformine"],
                diabetes_context: {
                    cardiovascular_risk: "Modere a eleve",
                    renal_function: "Preservee ou legerement reduite",
                    fragility: "Faible",
                    tolerance: "Bonne tolerance a la metformine",
                    glycemic_goals: "HbA1c < 7 % si securitaire et realiste",
                },
            },
            symptoms: ["Polydipsie"],
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
            finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Diabete de type 2" },
            })),
            normalizeClinicalAnalysis: vi.fn((parsed) => parsed),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        const request = create.mock.calls[0][0];
        expect(request.messages[1].content).toContain("Additional type 2 diabetes clinical context:");
        expect(request.messages[1].content).toContain("- weight_band: 80-99kg");
        expect(request.messages[1].content).toContain("- age_band: 50-59");
        expect(request.messages[1].content).toContain("- cardiovascular_risk: modere a eleve");
        expect(request.messages[1].content).toContain("- renal_function: preservee ou legerement reduite");
        expect(request.messages[1].content).toContain("- fragility: faible");
        expect(request.messages[1].content).toContain("- tolerance: bonne tolerance a la metformine");
        expect(request.messages[1].content).toContain("- glycemic_goals: hba1c < 7 % si securitaire et realiste");
    });

    it("keeps exact age and non-essential demographics out of the OpenAI prompt", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const create = vi.fn().mockResolvedValue({
            id: "upstream-1",
            choices: [
                {
                    message: {
                        content: '{"diagnosis":{"suspected":"Diabete de type 2"}}',
                    },
                },
            ],
        });

        await executeOpenAIAnalyze({
            openai: {
                chat: {
                    completions: { create },
                },
            },
            model: "gpt-4.1-mini",
            diagnosis: "Diabete de type 2",
            patient: {
                diagnosis: "Diabete de type 2",
                sex: "male",
                age_band: "50-59",
                symptoms: ["fatigue"],
                medical_history: ["Hypertension"],
                current_medications: ["Metformine"],
                diabetes_context: {
                    cardiovascular_risk: "Modere a eleve",
                },
            },
            symptoms: ["fatigue"],
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
            finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Diabete de type 2" },
            })),
            normalizeClinicalAnalysis: vi.fn((parsed) => parsed),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        const userPrompt = create.mock.calls[0][0].messages[1].content;
        expect(userPrompt).toContain('"age_band":"50-59"');
        expect(userPrompt).not.toContain('"age":57');
        expect(userPrompt).not.toContain('"country"');
        expect(userPrompt).not.toContain('"ethnicity"');
        expect(userPrompt).not.toContain('"forceReal"');
        expect(userPrompt).not.toContain('"openaiModel"');
        expect(userPrompt).not.toContain('"incidentAckId"');
    });

    it("rejects any forbidden cloud fields from the fixture payload before OpenAI transmission", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const create = vi.fn().mockResolvedValue({
            id: "upstream-1",
            choices: [
                {
                    message: {
                        content: '{"diagnosis":{"suspected":"Diabete de type 2"}}',
                    },
                },
            ],
        });
        const unsafePatient = loadUnsafePatientFixture();
        const cloudSafePatient = buildCloudSafePatientPayload(unsafePatient);

        await executeOpenAIAnalyze({
            openai: {
                chat: {
                    completions: { create },
                },
            },
            model: "gpt-4.1-mini",
            diagnosis: unsafePatient.diagnosis,
            patient: cloudSafePatient,
            symptoms: unsafePatient.symptoms,
            reqAuth: { userId: "u1", username: "admin", role: "SUPERADMIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
            finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Diabete de type 2" },
            })),
            normalizeClinicalAnalysis: vi.fn((parsed) => parsed),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        const userPrompt = create.mock.calls[0][0].messages[1].content;
        const serializedCloudPayload = JSON.stringify(cloudSafePatient);

        assertNoForbiddenCloudFields(serializedCloudPayload);
        assertNoForbiddenCloudFields(userPrompt);
        expect(serializedCloudPayload).toContain('"age_band":"50-59"');
        expect(serializedCloudPayload).toContain('"weight_band":"80-99kg"');
    });

    it("returns a blocking response when post-cloud scanning detects sensitive content", async () => {
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        const respondWithSecurityIncident = vi.fn().mockResolvedValue({
            blocked: true,
        });

        const result = await executeOpenAIAnalyze({
            openai: {
                chat: {
                    completions: {
                        create: vi.fn().mockResolvedValue({
                            id: "upstream-1",
                            choices: [{ message: { content: "email@example.com" } }],
                        }),
                    },
                },
            },
            model: "gpt-4.1-mini",
            diagnosis: "Migraine",
            patient: { medical_history: [], current_medications: [] },
            symptoms: ["headache"],
            reqAuth: null,
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fp-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
            finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-123"),
            detectNonSecureContent: vi.fn(() => ({
                hasMatches: true,
                matches: [{ type: "EMAIL" }],
            })),
            respondWithSecurityIncident,
            safeParseMedicalAI: vi.fn(),
            normalizeClinicalAnalysis: vi.fn(),
            isPlaceholderClinicalAnalysis: vi.fn(),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        expect(result.ok).toBe(false);
        expect(respondWithSecurityIncident).toHaveBeenCalledTimes(1);
    });
});
