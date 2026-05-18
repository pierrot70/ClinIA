export function createTranslationCacheService(deps) {
    const {
        buildVoiceAck,
        buildVoicePrompts,
        hasVoicePromptsShape,
    } = deps;

    const translationMemoryCache = new Map();
    const translationInFlightLocks = new Map();

    function makeTranslationCacheKey({ namespace, targetLang, sourceHash }) {
        return `${namespace}::${targetLang}::${sourceHash}`;
    }

    function buildTranslationCacheEntry({
        payload,
        model,
        targetLang,
        voiceAck,
        voicePrompts,
    }) {
        return {
            payload,
            model: model || "cache",
            targetLang,
            voiceAck: voiceAck || buildVoiceAck(targetLang),
            voicePrompts: hasVoicePromptsShape(voicePrompts)
                ? voicePrompts
                : buildVoicePrompts(targetLang),
        };
    }

    function isUntranslatedPayload(targetLang, payload, sourceStrings) {
        if (!payload || !sourceStrings) {
            return false;
        }

        const normalizedTarget = String(targetLang || "").toLowerCase().slice(0, 2);
        if (normalizedTarget === "fr") {
            return false;
        }

        try {
            return JSON.stringify(payload) === JSON.stringify(sourceStrings);
        } catch (e) {
            return false;
        }
    }

    function cacheTranslationInMemory({
        namespace,
        sourceHash,
        targetLang,
        payload,
        model,
        voiceAck,
        voicePrompts,
    }) {
        const key = makeTranslationCacheKey({
            namespace,
            targetLang,
            sourceHash,
        });

        translationMemoryCache.set(
            key,
            buildTranslationCacheEntry({
                payload,
                model,
                targetLang,
                voiceAck,
                voicePrompts,
            })
        );
    }

    return {
        translationMemoryCache,
        translationInFlightLocks,
        makeTranslationCacheKey,
        buildTranslationCacheEntry,
        isUntranslatedPayload,
        cacheTranslationInMemory,
    };
}
