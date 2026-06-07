export function createHomeTranslationService(deps) {
    const {
        UiTranslationCache,
        openai,
        makeSourceHash,
        supportsJsonResponseFormat,
        hasHomeI18nShape,
        VOICE_PROMPTS_SOURCE_FR,
        buildVoiceAck,
        buildVoicePrompts,
        hasVoicePromptsShape,
        translationMemoryCache,
        translationInFlightLocks,
        makeTranslationCacheKey,
        isUntranslatedPayload,
        cacheTranslationInMemory,
        logger = console,
        getModel = () => process.env.OPENAI_MODEL || "gpt-4.1-mini",
    } = deps;

    async function warmTranslationMemoryCache() {
        const docs = await UiTranslationCache.find({
            namespace: "home",
        }).lean();

        let warmed = 0;
        for (const doc of docs) {
            if (!doc?.sourceHash || !doc?.targetLang || !doc?.payload) {
                continue;
            }

            cacheTranslationInMemory({
                namespace: doc.namespace || "home",
                sourceHash: doc.sourceHash,
                targetLang: doc.targetLang,
                payload: doc.payload,
                model: doc.model,
                voiceAck: doc.voiceAck,
                voicePrompts: doc.voicePrompts,
            });
            warmed += 1;
        }

        logger.log(`[i18n] memory cache warmed with ${warmed} entries`);
    }

    async function handleHomeTranslate(req, res) {
        try {
            const { targetLang, sourceStrings } = req.body ?? {};
            const namespace = "home";

            const target =
                typeof targetLang === "string"
                    ? targetLang.trim().toLowerCase()
                    : "";

            if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(target)) {
                return res.status(400).json({
                    error: {
                        code: "INVALID_INPUT",
                        message:
                            "targetLang must be an ISO language code like 'en', 'fr', 'ja', 'de' or 'zh'.",
                        retryable: false,
                    },
                });
            }

            if (!hasHomeI18nShape(sourceStrings)) {
                return res.status(400).json({
                    error: {
                        code: "INVALID_INPUT",
                        message: "sourceStrings has an invalid shape.",
                        retryable: false,
                    },
                });
            }

            if (target === "fr") {
                return res.json({
                    data: sourceStrings,
                    meta: {
                        source: "passthrough",
                        lang: "fr",
                        voiceAck: buildVoiceAck("fr"),
                        voicePrompts: buildVoicePrompts("fr"),
                    },
                });
            }

            const sourceHash = makeSourceHash(sourceStrings);
            const memoryKey = makeTranslationCacheKey({
                namespace,
                targetLang: target,
                sourceHash,
            });

            const inMemory = translationMemoryCache.get(memoryKey);
            if (inMemory?.payload) {
                if (!hasHomeI18nShape(inMemory.payload)) {
                    translationMemoryCache.delete(memoryKey);
                    logger.warn("⚠️ I18N invalid memory cache invalidated", {
                        namespace,
                        target,
                        sourceHash,
                    });
                } else if (
                    isUntranslatedPayload(target, inMemory.payload, sourceStrings)
                ) {
                    translationMemoryCache.delete(memoryKey);
                    logger.warn("⚠️ I18N stale memory cache invalidated", {
                        namespace,
                        target,
                        sourceHash,
                    });
                } else {
                    logger.log("I18N_MEMORY_HIT", {
                        namespace,
                        target,
                        sourceHash,
                    });
                    return res.json({
                        data: inMemory.payload,
                        meta: {
                            source: "memory",
                            lang: target,
                            model: inMemory.model || "memory-cache",
                            voiceAck: inMemory.voiceAck || buildVoiceAck(target),
                            voicePrompts: hasVoicePromptsShape(
                                inMemory.voicePrompts
                            )
                                ? inMemory.voicePrompts
                                : buildVoicePrompts(target),
                        },
                    });
                }
            }

            try {
                const cached = await UiTranslationCache.findOne({
                    namespace,
                    targetLang: target,
                    sourceHash,
                }).lean();

                if (cached?.payload) {
                    if (!hasHomeI18nShape(cached.payload)) {
                        logger.warn("⚠️ I18N invalid DB cache invalidated", {
                            namespace,
                            target,
                            sourceHash,
                        });
                        await UiTranslationCache.deleteOne({ _id: cached._id });
                    } else if (
                        isUntranslatedPayload(target, cached.payload, sourceStrings)
                    ) {
                        logger.warn("⚠️ I18N stale DB cache invalidated", {
                            namespace,
                            target,
                            sourceHash,
                        });
                        await UiTranslationCache.deleteOne({ _id: cached._id });
                    } else {
                        const cachedVoicePrompts = hasVoicePromptsShape(
                            cached.voicePrompts
                        )
                            ? cached.voicePrompts
                            : buildVoicePrompts(target);

                        const cachedVoiceAck = cached.voiceAck || buildVoiceAck(target);

                        if (!hasVoicePromptsShape(cached.voicePrompts)) {
                            UiTranslationCache.updateOne(
                                { _id: cached._id },
                                { $set: { voicePrompts: cachedVoicePrompts } }
                            ).catch((err) => {
                                logger.warn(
                                    "⚠️ I18N cache backfill failed",
                                    err?.message
                                );
                            });
                        }

                        logger.log("I18N_CACHE_HIT", {
                            namespace,
                            target,
                            sourceHash,
                        });

                        cacheTranslationInMemory({
                            namespace,
                            sourceHash,
                            targetLang: target,
                            payload: cached.payload,
                            model: cached.model ?? "cache",
                            voiceAck: cachedVoiceAck,
                            voicePrompts: cachedVoicePrompts,
                        });

                        return res.json({
                            data: cached.payload,
                            meta: {
                                source: "cache",
                                lang: target,
                                model: cached.model ?? "cache",
                                voiceAck: cachedVoiceAck,
                                voicePrompts: cachedVoicePrompts,
                            },
                        });
                    }
                }
            } catch (cacheReadErr) {
                logger.warn("⚠️ I18N cache read failed", cacheReadErr?.message);
            }

            logger.log("I18N_CACHE_MISS", {
                namespace,
                target,
                sourceHash,
            });

            if (!req.auth?.userId) {
                return res.status(401).json({
                    error: {
                        code: "TRANSLATION_CACHE_MISS",
                        message:
                            "Authentification requise pour creer une nouvelle traduction.",
                        retryable: false,
                    },
                });
            }

            const model = getModel();
            const systemPrompt =
                "You are a UI localization engine for a medical assistant application. " +
                "Translate only values to target language while preserving JSON structure, keys, arrays, punctuation and placeholders. " +
                "Do not add medical claims. Return valid JSON only.";

            const userPrompt = {
                task: "Translate this UI string bundle",
                targetLang: target,
                constraints: [
                    "Preserve JSON keys exactly",
                    "Keep arrays lengths and order",
                    "Return voicePrompts with the same keys",
                    "Output strictly valid JSON object",
                ],
                sourceStrings,
                voicePrompts: VOICE_PROMPTS_SOURCE_FR,
            };

            const baseRequest = {
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: JSON.stringify(userPrompt) },
                ],
                temperature: 0.1,
            };

            const request = supportsJsonResponseFormat(model)
                ? {
                    ...baseRequest,
                    response_format: { type: "json_object" },
                }
                : baseRequest;

            const inFlight = translationInFlightLocks.get(memoryKey);
            if (inFlight) {
                logger.log("I18N_LOCK_WAIT", {
                    namespace,
                    target,
                    sourceHash,
                });
                const sharedResult = await inFlight;
                return res.json({
                    data: sharedResult.payload,
                    meta: {
                        source: "lock",
                        model: sharedResult.model,
                        lang: target,
                        voiceAck: sharedResult.voiceAck,
                        voicePrompts: sharedResult.voicePrompts,
                    },
                });
            }

            const translatePromise = (async () => {
                const completion = await openai.chat.completions.create(request);
                const content = completion?.choices?.[0]?.message?.content ?? "{}";

                let translated;
                try {
                    translated = JSON.parse(content);
                } catch (e) {
                    const error = new Error("UPSTREAM_INVALID_JSON");
                    error.code = "UPSTREAM_INVALID_JSON";
                    throw error;
                }

                if (!hasHomeI18nShape(translated)) {
                    const error = new Error("UPSTREAM_INVALID_SHAPE");
                    error.code = "UPSTREAM_INVALID_SHAPE";
                    throw error;
                }

                if (isUntranslatedPayload(target, translated, sourceStrings)) {
                    const error = new Error("UPSTREAM_UNTRANSLATED");
                    error.code = "UPSTREAM_UNTRANSLATED";
                    throw error;
                }

                const translatedVoicePrompts = hasVoicePromptsShape(
                    translated.voicePrompts
                )
                    ? translated.voicePrompts
                    : buildVoicePrompts(target);
                const voiceAck = buildVoiceAck(target);

                try {
                    await UiTranslationCache.create({
                        namespace,
                        sourceLocale: "fr",
                        targetLang: target,
                        sourceHash,
                        payload: translated,
                        voiceAck,
                        voicePrompts: translatedVoicePrompts,
                        model,
                    });
                } catch (cacheWriteErr) {
                    if (cacheWriteErr?.code === 11000) {
                        // Another concurrent request wrote it first; harmless.
                    } else {
                        logger.warn(
                            "⚠️ I18N cache write failed",
                            cacheWriteErr?.message
                        );
                    }
                }

                cacheTranslationInMemory({
                    namespace,
                    sourceHash,
                    targetLang: target,
                    payload: translated,
                    model,
                    voiceAck,
                    voicePrompts: translatedVoicePrompts,
                });

                return {
                    payload: translated,
                    model,
                    voiceAck,
                    voicePrompts: translatedVoicePrompts,
                };
            })();

            translationInFlightLocks.set(memoryKey, translatePromise);
            try {
                const translatedResult = await translatePromise;
                return res.json({
                    data: translatedResult.payload,
                    meta: {
                        source: "openai",
                        model: translatedResult.model,
                        lang: target,
                        voiceAck: translatedResult.voiceAck,
                        voicePrompts: translatedResult.voicePrompts,
                    },
                });
            } catch (upstreamErr) {
                if (upstreamErr?.code === "UPSTREAM_INVALID_JSON") {
                    return res.status(502).json({
                        error: {
                            code: "UPSTREAM_INVALID_JSON",
                            message: "OpenAI returned invalid JSON for translation.",
                            retryable: true,
                        },
                    });
                }

                if (upstreamErr?.code === "UPSTREAM_INVALID_SHAPE") {
                    return res.status(502).json({
                        error: {
                            code: "UPSTREAM_INVALID_SHAPE",
                            message: "Translated payload has invalid shape.",
                            retryable: true,
                        },
                    });
                }

                if (upstreamErr?.code === "UPSTREAM_UNTRANSLATED") {
                    return res.status(502).json({
                        error: {
                            code: "UPSTREAM_UNTRANSLATED",
                            message: "Translation result was identical to source language.",
                            retryable: true,
                        },
                    });
                }

                throw upstreamErr;
            } finally {
                if (translationInFlightLocks.get(memoryKey) === translatePromise) {
                    translationInFlightLocks.delete(memoryKey);
                }
            }
        } catch (err) {
            logger.error("🔥 /api/i18n/home-translate ERROR", err);
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Translation service failed.",
                    retryable: true,
                },
            });
        }
    }

    return {
        warmTranslationMemoryCache,
        handleHomeTranslate,
    };
}
