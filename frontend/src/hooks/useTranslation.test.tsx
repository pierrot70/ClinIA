import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { labels } from "../i18n/uiLabels";
import { useTranslation } from "./useTranslation";

vi.mock("../services/translationApi", () => ({
    translateText: vi.fn().mockRejectedValue(new Error("Translation API error")),
    saveLocalTranslation: vi.fn().mockResolvedValue(undefined),
}));

describe("useTranslation", () => {
    it("falls back to the English label when the translation API fails", async () => {
        const { result } = renderHook(() =>
            useTranslation({
                text: labels.app.landing.doctorLoginTitle,
                targetLang: "en-CA",
                namespace: "app-landing",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Doctor sign-in");
        expect(result.current.error).toBe("Translation API error");
    });
});
