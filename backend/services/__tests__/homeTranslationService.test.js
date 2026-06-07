import { describe, expect, it, vi } from "vitest";

import { createHomeTranslationService } from "../homeTranslationService.js";

function createResponseDouble() {
    return {
        status: vi.fn(),
        json: vi.fn(),
    };
}

describe("homeTranslationService", () => {
    function createBaseDeps(overrides = {}) {
        return {
            UiTranslationCache: {
                find: vi.fn(),
                findOne: vi.fn(),
                create: vi.fn(),
                deleteOne: vi.fn(),
                updateOne: vi.fn(),
            },
            openai: {
                chat: {
                    completions: {
                        create: vi.fn(),
                    },
                },
            },
            makeSourceHash: vi.fn(() => "hash-123"),
            supportsJsonResponseFormat: vi.fn(() => true),
            hasHomeI18nShape: vi.fn(
                (value) => Boolean(value && value.home && value.search && value.options)
            ),
            VOICE_PROMPTS_SOURCE_FR: {
                dictationInstruction: "Dites ou ecrivez votre diagnostic.",
            },
            buildVoiceAck: vi.fn((lang) => `ack:${lang}`),
            buildVoicePrompts: vi.fn((lang) => ({
                dictationInstruction: `prompt:${lang}`,
            })),
            hasVoicePromptsShape: vi.fn(
                (value) =>
                    Boolean(
                        value &&
                        typeof value === "object" &&
                        typeof value.dictationInstruction === "string" &&
                        value.dictationInstruction.trim().length > 0
                    )
            ),
            translationMemoryCache: new Map(),
            translationInFlightLocks: new Map(),
            makeTranslationCacheKey: vi.fn(
                ({ namespace, targetLang, sourceHash }) =>
                    `${namespace}::${targetLang}::${sourceHash}`
            ),
            isUntranslatedPayload: vi.fn(() => false),
            cacheTranslationInMemory: vi.fn(),
            logger: {
                log: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            },
            getModel: vi.fn(() => "gpt-4.1-mini"),
            ...overrides,
        };
    }

    const sourceStrings = {
        home: { title: "Bonjour" },
        search: { submit: "Chercher" },
        options: {
            objectives: [],
            clinicalScopes: [],
            ageGroups: [],
            symptomProfiles: [],
            durations: [],
            severityLevels: [],
            redFlagStatuses: [],
            comorbidityContexts: [],
        },
    };

    it("returns a passthrough response for french", async () => {
        const deps = createBaseDeps();
        const { handleHomeTranslate } = createHomeTranslationService(deps);
        const res = createResponseDouble();
        res.json.mockReturnValue(res);

        await handleHomeTranslate(
            { body: { targetLang: "fr", sourceStrings } },
            res
        );

        expect(res.json).toHaveBeenCalledWith({
            data: sourceStrings,
            meta: {
                source: "passthrough",
                lang: "fr",
                voiceAck: "ack:fr",
                voicePrompts: { dictationInstruction: "prompt:fr" },
            },
        });
    });

    it("warms the in-memory cache from persisted translations", async () => {
        const lean = vi.fn().mockResolvedValue([
            {
                namespace: "home",
                sourceHash: "hash-1",
                targetLang: "en",
                payload: { home: { title: "Hello" } },
                model: "gpt-4.1-mini",
                voiceAck: "ack:en",
                voicePrompts: { dictationInstruction: "prompt:en" },
            },
        ]);
        const deps = createBaseDeps({
            UiTranslationCache: {
                find: vi.fn(() => ({ lean })),
                findOne: vi.fn(),
                create: vi.fn(),
                deleteOne: vi.fn(),
                updateOne: vi.fn(),
            },
        });

        const { warmTranslationMemoryCache } = createHomeTranslationService(deps);

        await warmTranslationMemoryCache();

        expect(deps.cacheTranslationInMemory).toHaveBeenCalledWith({
            namespace: "home",
            sourceHash: "hash-1",
            targetLang: "en",
            payload: { home: { title: "Hello" } },
            model: "gpt-4.1-mini",
            voiceAck: "ack:en",
            voicePrompts: { dictationInstruction: "prompt:en" },
        });
        expect(deps.logger.log).toHaveBeenCalledWith(
            "[i18n] memory cache warmed with 1 entries"
        );
    });

    it("allows anonymous users to read a cached home translation", async () => {
        const cachedPayload = {
            home: { title: "Hello" },
            search: { submit: "Search" },
            options: sourceStrings.options,
        };
        const deps = createBaseDeps();
        deps.UiTranslationCache.findOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "cache-1",
                namespace: "home",
                targetLang: "en",
                sourceHash: "hash-123",
                payload: cachedPayload,
                model: "gpt-4.1-mini",
                voiceAck: "ack:en",
                voicePrompts: { dictationInstruction: "prompt:en" },
            }),
        });
        const { handleHomeTranslate } = createHomeTranslationService(deps);
        const res = createResponseDouble();
        res.json.mockReturnValue(res);

        await handleHomeTranslate(
            { body: { targetLang: "en", sourceStrings } },
            res
        );

        expect(res.json).toHaveBeenCalledWith({
            data: cachedPayload,
            meta: {
                source: "cache",
                lang: "en",
                model: "gpt-4.1-mini",
                voiceAck: "ack:en",
                voicePrompts: { dictationInstruction: "prompt:en" },
            },
        });
        expect(deps.openai.chat.completions.create).not.toHaveBeenCalled();
    });

    it("blocks anonymous cache misses before calling OpenAI", async () => {
        const deps = createBaseDeps();
        deps.UiTranslationCache.findOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });
        const { handleHomeTranslate } = createHomeTranslationService(deps);
        const res = createResponseDouble();
        res.status.mockReturnValue(res);
        res.json.mockReturnValue(res);

        await handleHomeTranslate(
            { body: { targetLang: "de", sourceStrings } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "TRANSLATION_CACHE_MISS",
                message:
                    "Authentification requise pour creer une nouvelle traduction.",
                retryable: false,
            },
        });
        expect(deps.openai.chat.completions.create).not.toHaveBeenCalled();
        expect(deps.UiTranslationCache.create).not.toHaveBeenCalled();
    });
});
