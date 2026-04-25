import { describe, expect, it } from "vitest";

import { UI_LABELS_FR } from "./uiLabels.fr";
import { labels } from "./uiLabels";

function collectLeafStrings(value: unknown): string[] {
    if (typeof value === "string") {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.flatMap(collectLeafStrings);
    }

    if (value && typeof value === "object") {
        return Object.values(value).flatMap(collectLeafStrings);
    }

    return [];
}

describe("UI labels", () => {
    it("uses the French Git-traceable source as the exported label registry", () => {
        expect(labels).toBe(UI_LABELS_FR);
    });

    it("contains only non-empty visible strings", () => {
        const visibleStrings = collectLeafStrings(UI_LABELS_FR);

        expect(visibleStrings.length).toBeGreaterThan(0);
        expect(visibleStrings.every((text) => text.trim().length > 0)).toBe(true);
    });
});
