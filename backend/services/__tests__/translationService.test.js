import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { UiTranslationCache } from "../../models/UiTranslationCache.js";
import { getCachedTranslation } from "../translationService.js";

vi.mock("../../models/UiTranslationCache.js", () => ({ UiTranslationCache: { findOne: vi.fn() } }));
const source = "{count} sur {limit} tentatives";
const request = { namespace: "approved-test", sourceLocale: "fr", targetLang: "en-CA", text: source };
beforeEach(() => vi.mocked(UiTranslationCache.findOne).mockReset());

describe("read-only UI translation cache", () => {
    it("reads by the exact versioned source hash and locale without writing", async () => {
        vi.mocked(UiTranslationCache.findOne).mockResolvedValue({ payload: { text: "{count} of {limit} attempts" } });
        await expect(getCachedTranslation(request)).resolves.toEqual({ text: "{count} of {limit} attempts" });
        expect(UiTranslationCache.findOne).toHaveBeenCalledWith({
            namespace: "approved-test", sourceLocale: "fr", targetLang: "en-CA",
            sourceHash: crypto.createHash("sha256").update(source).digest("hex"),
        });
    });

    it.each([
        undefined, null, {}, { text: null }, { text: 42 }, { text: {} }, { text: "" }, { text: " \n " },
        { text: "Attempts" }, { text: "{count} attempts" }, { text: "{count} of {maximum}" },
        { text: "{count} {limit} {extra}" }, { text: "{count} {count} {limit}" },
    ])("rejects invalid cached payload %# as a cache miss", async payload => {
        vi.mocked(UiTranslationCache.findOne).mockResolvedValue({ payload });
        await expect(getCachedTranslation(request)).rejects.toMatchObject({ code: "TRANSLATION_CACHE_MISS" });
    });

    it("permits parameter reordering while preserving each token", async () => {
        vi.mocked(UiTranslationCache.findOne).mockResolvedValue({ payload: { text: "Limit {limit}; used {count}" } });
        await expect(getCachedTranslation(request)).resolves.toMatchObject({ text: "Limit {limit}; used {count}" });
    });

    it("rejects an absent document without generating a translation", async () => {
        vi.mocked(UiTranslationCache.findOne).mockResolvedValue(null);
        await expect(getCachedTranslation(request)).rejects.toMatchObject({ code: "TRANSLATION_CACHE_MISS" });
    });
});
