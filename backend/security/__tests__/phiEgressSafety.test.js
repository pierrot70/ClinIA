import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCachedTranslation } = vi.hoisted(() => ({
    getCachedTranslation: vi.fn(),
}));

vi.mock("../../services/translationService.js", () => ({
    getCachedTranslation,
}));

import translationRouter from "../../routes/translation.js";
import { executeOpenAIAnalyze } from "../../services/aiAnalyzeOpenAIService.js";
import {
    assessCloudClinicalPayload,
    buildCloudSafePatientPayload,
} from "../../utils/requestSafety.js";

const PHI_CANARY = "PHI-CANARY-7F3A9C";

function makeResponseDouble() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

function getTranslationHandler() {
    const layer = translationRouter.stack.find(
        (entry) => entry.route?.path === "/" && entry.route?.methods?.post
    );

    return layer.route.stack.at(-1).handle;
}

function expectNoPhiCanary(value) {
    expect(JSON.stringify(value)).not.toContain(PHI_CANARY);
}

describe("PHI egress safety", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not send patient identifiers to OpenAI or technical logs and audits", async () => {
        const create = vi.fn().mockResolvedValue({
            id: "upstream-safe-1",
            choices: [
                {
                    message: {
                        content: '{"diagnosis":{"suspected":"Migraine"}}',
                    },
                },
            ],
        });
        const logger = { log: vi.fn(), error: vi.fn() };
        const recordOpenAIRequestAuditEvent = vi
            .fn()
            .mockResolvedValue({ _id: "audit-safe-1" });
        const finalizeOpenAIRequestAuditEvent = vi.fn().mockResolvedValue({});
        const patient = {
            diagnosis: "Migraine",
            symptoms: ["cephalee"],
            medical_history: ["asthme"],
            nom: `Nom ${PHI_CANARY}`,
            prenom: PHI_CANARY,
            courriel: `${PHI_CANARY.toLowerCase()}@example.test`,
            telephone: "5145551212",
            num_assurance_maladie: "ABCD12345678",
            addresse: `100 rue ${PHI_CANARY}`,
            clinical_notes: `Note clinique ${PHI_CANARY}`,
        };
        const safePatient = buildCloudSafePatientPayload(patient);
        const res = makeResponseDouble();

        const result = await executeOpenAIAnalyze({
            openai: { chat: { completions: { create } } },
            model: "gpt-4.1-mini",
            diagnosis: patient.diagnosis,
            patient: safePatient,
            symptoms: patient.symptoms,
            reqAuth: { userId: "user-safe-1", username: "doctor", role: "MEDECIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fingerprint-safe-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent,
            finalizeOpenAIRequestAuditEvent,
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-safe-1"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(() => ({
                diagnosis: { suspected: "Migraine" },
            })),
            normalizeClinicalAnalysis: vi.fn((value) => value),
            isPlaceholderClinicalAnalysis: vi.fn(() => false),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger,
        });

        expect(result.ok).toBe(true);
        expect(create).toHaveBeenCalledTimes(1);
        expectNoPhiCanary(safePatient);
        expectNoPhiCanary(create.mock.calls);
        expectNoPhiCanary(recordOpenAIRequestAuditEvent.mock.calls);
        expectNoPhiCanary(finalizeOpenAIRequestAuditEvent.mock.calls);
        expectNoPhiCanary(logger.log.mock.calls);
        expectNoPhiCanary(logger.error.mock.calls);
    });

    it("rejects arbitrary PHI before it can be read from or written to the UI translation cache", async () => {
        const res = makeResponseDouble();

        await getTranslationHandler()(
            {
                body: {
                    text: `Traduire la note clinique ${PHI_CANARY}`,
                    translated: PHI_CANARY,
                    forceSave: true,
                    targetLang: "en-CA",
                },
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(getCachedTranslation).not.toHaveBeenCalled();
        expectNoPhiCanary(getCachedTranslation.mock.calls);
    });

    it("rejects an unlabeled patient name before building the OpenAI payload", () => {
        const assessment = assessCloudClinicalPayload({
            diagnosis: "Migraine chez Pierre Lasante",
            symptoms: ["Douleur severe pour Pierre Lasante"],
            medical_history: [],
            current_medications: [],
        });

        expect(assessment.approved).toBe(false);
        expect(assessment.rejectedFields).toEqual(["diagnosis", "symptoms"]);
        expect(JSON.stringify(assessment.cloudPayload)).not.toContain("Pierre Lasante");
    });

    it("does not call OpenAI when a future caller passes unlabeled free text", async () => {
        const create = vi.fn();
        const res = makeResponseDouble();

        const result = await executeOpenAIAnalyze({
            openai: { chat: { completions: { create } } },
            model: "gpt-4.1-mini",
            diagnosis: "Migraine chez Pierre Lasante",
            patient: {
                symptoms: ["Douleur severe pour Pierre Lasante"],
                medical_history: [],
                current_medications: [],
            },
            symptoms: ["Douleur severe pour Pierre Lasante"],
            reqAuth: { userId: "user-safe-1", username: "doctor", role: "MEDECIN" },
            req: { ip: "127.0.0.1", headers: {} },
            fingerprint: "fingerprint-rejected-1",
            forceRealSafe: false,
            neutralizationMeta: null,
            supportsJsonResponseFormat: vi.fn(() => true),
            recordOpenAIRequestAuditEvent: vi.fn(),
            finalizeOpenAIRequestAuditEvent: vi.fn(),
            getRequestIp: vi.fn(() => "127.0.0.1"),
            makeSourceHash: vi.fn(() => "hash-safe-1"),
            detectNonSecureContent: vi.fn(() => ({ hasMatches: false })),
            respondWithSecurityIncident: vi.fn(),
            safeParseMedicalAI: vi.fn(),
            normalizeClinicalAnalysis: vi.fn(),
            isPlaceholderClinicalAnalysis: vi.fn(),
            recordOpenAISuccess: vi.fn(),
            recordOpenAIFailure: vi.fn(),
            res,
            logger: { log: vi.fn(), error: vi.fn() },
        });

        expect(result.ok).toBe(false);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(create).not.toHaveBeenCalled();
        expect(JSON.stringify(res.json.mock.calls)).not.toContain("Pierre Lasante");
    });
});
