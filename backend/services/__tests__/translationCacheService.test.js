import { describe, expect, it } from "vitest";

import { createTranslationCacheService } from "../translationCacheService.js";

describe("translationCacheService", () => {
    function createService() {
        return createTranslationCacheService({
            buildVoiceAck: (lang) => `ack:${lang}`,
            buildVoicePrompts: (lang) => ({
                dictationInstruction: `prompt:${lang}`,
            }),
            hasVoicePromptsShape: (value) =>
                Boolean(
                    value &&
                    typeof value === "object" &&
                    typeof value.dictationInstruction === "string" &&
                    value.dictationInstruction.trim().length > 0
                ),
        });
    }

    it("builds stable cache keys and enriches entries with fallback voice metadata", () => {
        const service = createService();

        expect(
            service.makeTranslationCacheKey({
                namespace: "home",
                targetLang: "en",
                sourceHash: "abc123",
            })
        ).toBe("home::en::abc123");

        expect(
            service.buildTranslationCacheEntry({
                payload: { home: {} },
                model: "",
                targetLang: "en",
            })
        ).toEqual({
            payload: { home: {} },
            model: "cache",
            targetLang: "en",
            voiceAck: "ack:en",
            voicePrompts: {
                dictationInstruction: "prompt:en",
            },
        });
    });

    it("detects untranslated payloads outside French and stores entries in memory", () => {
        const service = createService();
        const sourceStrings = { home: { title: "Bonjour" } };

        expect(
            service.isUntranslatedPayload("en", sourceStrings, sourceStrings)
        ).toBe(true);
        expect(
            service.isUntranslatedPayload("fr", sourceStrings, sourceStrings)
        ).toBe(false);

        service.cacheTranslationInMemory({
            namespace: "home",
            sourceHash: "abc123",
            targetLang: "en",
            payload: { home: { title: "Hello" } },
            model: "gpt-4.1-mini",
        });

        expect(
            service.translationMemoryCache.get("home::en::abc123")
        ).toEqual({
            payload: { home: { title: "Hello" } },
            model: "gpt-4.1-mini",
            targetLang: "en",
            voiceAck: "ack:en",
            voicePrompts: {
                dictationInstruction: "prompt:en",
            },
        });
    });
});
