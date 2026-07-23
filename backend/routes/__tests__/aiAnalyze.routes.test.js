import { afterEach, describe, expect, it, vi } from "vitest";

import { createAiAnalyzeRouter } from "../aiAnalyze.js";
import {
    assessCloudClinicalPayload,
    buildCloudSafePatientPayload,
    detectPromptInjection,
    sanitizeRequestPayload,
} from "../../utils/requestSafety.js";
import { extractPrimaryClinicalConcern } from "../../utils/clinicalAnalysis.js";
import { sanitizeNonSecureContent } from "../../utils/securityIncident.js";

function getAnalyzeHandler(router) {
    const layer = router.stack.find(
        (entry) => entry.route?.path === "/analyze" && entry.route?.methods?.post
    );

    return layer.route.stack.at(-1).handle;
}

function createResponseDouble() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

function createRouterDependencies({ openai, persistOrReuseDiagnosis }) {
    return {
        openai,
        assessCloudClinicalPayload,
        buildCloudSafePatientPayload,
        sanitizeRequestPayload,
        detectPromptInjection,
        extractPrimaryClinicalConcern,
        detectNonSecureContent: vi.fn(() => ({ hasMatches: false, matches: [] })),
        getAcknowledgedSecurityIncident: vi.fn(),
        respondWithSecurityIncident: vi.fn(),
        getRequestIp: vi.fn(() => "127.0.0.1"),
        makeSourceHash: vi.fn(() => "safe-hash"),
        makeFingerprint: vi.fn(() => "fingerprint-1"),
        findPersistedDiagnosisByFingerprint: vi.fn().mockResolvedValue(null),
        upgradePersistedDiagnosisOutput: vi.fn(),
        normalizeClinicalAnalysis: vi.fn((analysis) => analysis),
        isPlaceholderClinicalAnalysis: vi.fn(() => false),
        getMockForDiagnosis: vi.fn(),
        persistOrReuseDiagnosis,
        canCallOpenAI: vi.fn(() => true),
        supportsJsonResponseFormat: vi.fn(() => true),
        recordOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({ _id: "audit-1" }),
        finalizeOpenAIRequestAuditEvent: vi.fn().mockResolvedValue({}),
        safeParseMedicalAI: vi.fn((value) => JSON.parse(value)),
        recordOpenAISuccess: vi.fn(),
        recordOpenAIFailure: vi.fn(),
        sanitizeNonSecureContent,
    };
}

describe("POST /api/ai/analyze real simulated path", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("keeps approved French aliases approved through both cloud safety checks", async () => {
        vi.stubEnv("CLINIA_FORCE_MOCK", "false");
        vi.stubEnv("CLINIA_MOCK_AI", "false");

        const createCompletion = vi.fn().mockResolvedValue({
            id: "completion-1",
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            diagnosis: { suspected: "Arterial hypertension" },
                        }),
                    },
                },
            ],
        });
        const openai = {
            chat: { completions: { create: createCompletion } },
        };
        const persistOrReuseDiagnosis = vi.fn().mockImplementation(
            async ({ output }) => ({
                ok: true,
                doc: { output },
                writeAuditRecorded: false,
            })
        );
        const router = createAiAnalyzeRouter(
            createRouterDependencies({ openai, persistOrReuseDiagnosis })
        );
        const res = createResponseDouble();

        await getAnalyzeHandler(router)(
            {
                body: {
                    diagnosis: "Hypertension arterielle",
                    symptoms: ["Cephalee", "Pression arterielle elevee"],
                    medical_history: ["Dyslipidemie"],
                    current_medications: ["Aucune"],
                    age: 55,
                    sex: "male",
                    country: "CA",
                    ethnicity: "prefer_not_to_say",
                    forceReal: true,
                    openaiModel: "gpt-4.1-mini",
                },
                headers: {},
                auth: {
                    userId: "doctor-1",
                    username: "doctor",
                    role: "MEDECIN",
                },
                requestContext: {
                    instanceId: "instance-test",
                    requestId: "request-test",
                },
                ip: "127.0.0.1",
            },
            res
        );

        expect(createCompletion).toHaveBeenCalledOnce();
        const cloudPrompt = createCompletion.mock.calls[0][0].messages[1].content;
        expect(cloudPrompt).toContain("Arterial hypertension");
        expect(cloudPrompt).not.toContain("Hypertension arterielle");
        expect(persistOrReuseDiagnosis).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "real",
                input: expect.objectContaining({
                    diagnosis: "Hypertension arterielle",
                }),
            })
        );
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { diagnosis: { suspected: "Arterial hypertension" } },
                meta: expect.objectContaining({ source: "real" }),
            })
        );
    });
});
