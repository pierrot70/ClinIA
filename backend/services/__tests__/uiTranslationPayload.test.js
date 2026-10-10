import { describe, expect, it } from "vitest";
import { isValidUiTranslationPayload } from "../uiTranslationPayload.js";

describe("approved UI translation payload validation", () => {
    it.each([undefined, null, 42, {}, [], "", " \n "])("rejects invalid French source %# without throwing", source => {
        expect(isValidUiTranslationPayload({ text: "Translation" }, source)).toBe(false);
    });

    it.each([undefined, null, "Translation", 42, [], {}, { text: false }, { text: [] }, { text: " \n " }])(
        "rejects invalid payload shape %#", payload => {
            expect(isValidUiTranslationPayload(payload, "Libellé approuvé")).toBe(false);
        },
    );

    it("requires an object even when an array carries a text field", () => {
        const payload = Object.assign([], { text: "Translation" });
        expect(isValidUiTranslationPayload(payload, "Libellé approuvé")).toBe(false);
    });

    it("preserves repeated named tokens and permits reordering", () => {
        const source = "{count} / {limit} ; encore {count}";
        expect(isValidUiTranslationPayload({ text: "Limit {limit}; {count} and {count}" }, source)).toBe(true);
        expect(isValidUiTranslationPayload({ text: "{count} / {limit}" }, source)).toBe(false);
        expect(isValidUiTranslationPayload({ text: "{count} / {limit} / {total}" }, source)).toBe(false);
    });

    it("rejects changed token case and token names with digits or underscores lost", () => {
        const source = "{count_2} / {limit}";
        expect(isValidUiTranslationPayload({ text: "{Count_2} / {limit}" }, source)).toBe(false);
        expect(isValidUiTranslationPayload({ text: "{count_2} / {limit}" }, source)).toBe(true);
    });

    it("permits stable brand names; structural validation does not infer language", () => {
        expect(isValidUiTranslationPayload({ text: "ClinIA" }, "ClinIA")).toBe(true);
    });
});
