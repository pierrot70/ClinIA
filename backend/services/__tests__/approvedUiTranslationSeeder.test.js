import { describe, expect, it, vi } from "vitest";

import { createApprovedUiTranslationSeeder } from "../approvedUiTranslationSeeder.js";

const catalog = [
    { namespace: "app-landing", text: "ClinIA" },
    { namespace: "app-status", text: "Maintenance en cours" },
];

function createCache({ existing = null } = {}) {
    return {
        findOne: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(existing) })),
        create: vi.fn(),
    };
}

describe("approved UI translation seeder", () => {
    it("lists only approved catalog entries during a dry run", async () => {
        const UiTranslationCache = createCache();
        const translate = vi.fn();
        const logger = { log: vi.fn() };
        const seed = createApprovedUiTranslationSeeder({
            UiTranslationCache,
            catalog,
            translate,
            logger,
        });

        await expect(seed({ targetLang: "en-CA", dryRun: true })).resolves.toEqual({
            pending: 2,
            created: 0,
            skipped: 0,
        });
        expect(translate).not.toHaveBeenCalled();
        expect(UiTranslationCache.create).not.toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledTimes(2);
    });

    it("writes a translated approved entry with majority write concern", async () => {
        const UiTranslationCache = createCache();
        const translate = vi.fn().mockResolvedValue("ClinIA");
        const seed = createApprovedUiTranslationSeeder({
            UiTranslationCache,
            catalog: [catalog[0]],
            translate,
            logger: { log: vi.fn() },
        });

        await expect(seed({ targetLang: "en-CA", dryRun: false })).resolves.toEqual({
            pending: 0,
            created: 1,
            skipped: 0,
        });
        expect(translate).toHaveBeenCalledWith({
            sourceText: "ClinIA",
            targetLang: "en-CA",
        });
        expect(UiTranslationCache.create).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    namespace: "app-landing",
                    targetLang: "en-CA",
                    payload: { text: "ClinIA" },
                    model: "gpt-4.1-mini",
                }),
            ],
            { writeConcern: { w: "majority", j: true, wtimeout: 5000 } }
        );
    });

    it("does not translate entries already present in the local cache", async () => {
        const UiTranslationCache = createCache({ existing: { _id: "cached" } });
        const translate = vi.fn();
        const seed = createApprovedUiTranslationSeeder({
            UiTranslationCache,
            catalog: [catalog[0]],
            translate,
            logger: { log: vi.fn() },
        });

        await expect(seed({ targetLang: "en-CA", dryRun: false })).resolves.toEqual({
            pending: 0,
            created: 0,
            skipped: 1,
        });
        expect(translate).not.toHaveBeenCalled();
        expect(UiTranslationCache.create).not.toHaveBeenCalled();
    });

    it("treats a concurrent unique-index creation as an idempotent skip", async () => {
        const UiTranslationCache = createCache();
        UiTranslationCache.create.mockRejectedValue({ code: 11000 });
        const translate = vi.fn().mockResolvedValue("ClinIA");
        const logger = { log: vi.fn() };
        const seed = createApprovedUiTranslationSeeder({
            UiTranslationCache,
            catalog: [catalog[0]],
            translate,
            logger,
        });

        await expect(seed({ targetLang: "en-CA", dryRun: false })).resolves.toEqual({
            pending: 0,
            created: 0,
            skipped: 1,
        });
        expect(logger.log).toHaveBeenCalledWith(
            expect.stringContaining("reason=already_created")
        );
    });
});
