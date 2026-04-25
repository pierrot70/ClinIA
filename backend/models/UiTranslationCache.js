import mongoose from "mongoose";

const UiTranslationCacheSchema = new mongoose.Schema(
    {
        namespace: {
            type: String,
            required: true,
            index: true,
            default: "home",
        },
        sourceLocale: {
            type: String,
            required: true,
            default: "fr",
        },
        targetLang: {
            type: String,
            required: true,
            index: true,
        },
        sourceHash: {
            type: String,
            required: true,
            index: true,
        },
        sourceText: {
            type: String,
            default: "",
        },
        payload: {
            type: Object,
            required: true,
        },
        voiceAck: {
            type: String,
            default: "",
        },
        voicePrompts: {
            type: Object,
            default: {},
        },
        model: {
            type: String,
            default: "unknown",
        },
    },
    { timestamps: true }
);

UiTranslationCacheSchema.index(
    { namespace: 1, targetLang: 1, sourceHash: 1 },
    { unique: true }
);

export const UiTranslationCache = mongoose.model(
    "UiTranslationCache",
    UiTranslationCacheSchema
);
