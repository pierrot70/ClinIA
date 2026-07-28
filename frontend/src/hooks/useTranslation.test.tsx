import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { labels } from "../i18n/uiLabels";
import { useTranslation } from "./useTranslation";

const { translateTextMock } = vi.hoisted(() => ({
    translateTextMock: vi.fn(),
}));

vi.mock("../services/translationApi", () => ({
    translateText: translateTextMock,
}));

describe("useTranslation", () => {
    it("does not translate French Canadian labels when the source is French", async () => {
        translateTextMock.mockRejectedValue(new Error("Translation API error"));

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.patientsPage.pagination.pageSeparator,
                targetLang: "fr-CA",
                namespace: "patients-page",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("/");
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("does not send punctuation-only labels to translation for any language", async () => {
        translateTextMock.mockRejectedValue(new Error("Translation API error"));

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.patientsPage.pagination.pageSeparator,
                targetLang: "es",
                namespace: "patients-page",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("/");
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("uses deterministic Vietnamese fallbacks for short patient name labels", async () => {
        translateTextMock.mockResolvedValue("Prénom se traduit en vietnamien par \"Tên\".");

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.patientsPage.search.firstNamePlaceholder,
                targetLang: "vi",
                namespace: "patients-page",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Tên");
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("uses deterministic Vietnamese fallback for the short street label", async () => {
        translateTextMock.mockResolvedValue("Rue en vietnamien se traduit par \"đường\".");

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.cliniquesPage.filters.streetLabel,
                targetLang: "vi",
                namespace: "cliniques-page",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Đường");
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("uses deterministic Vietnamese fallback for the availability label", async () => {
        translateTextMock.mockResolvedValue(
            "Disponibilités se traduit en vietnamien par : \"Sẵn sàng\" ou \"Khả năng cung cấp\" selon le contexte."
        );

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.specialistsPage.table.availability,
                targetLang: "vi",
                namespace: "specialists-page",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Lịch trống");
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("keeps technical OpenAI log labels stable in Vietnamese", async () => {
        translateTextMock.mockResolvedValue("Tên người dùng bị ẩn");

        const username = renderHook(() =>
            useTranslation({
                text: labels.openAiLogs.filters.maskedUsername,
                targetLang: "vi",
                namespace: "openai-logs",
            })
        );
        const transport = renderHook(() =>
            useTranslation({
                text: labels.openAiLogs.filters.transport,
                targetLang: "vi",
                namespace: "openai-logs",
            })
        );

        await waitFor(() => {
            expect(username.result.current.loading).toBe(false);
            expect(transport.result.current.loading).toBe(false);
        });

        expect(username.result.current.translated).toBe("Masked username");
        expect(transport.result.current.translated).toBe("Transport");
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("keeps the French source for technical OpenAI log labels in French", async () => {
        translateTextMock.mockRejectedValue(new Error("Translation API error"));

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.openAiLogs.filters.maskedUsername,
                targetLang: "fr-CA",
                namespace: "openai-logs",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Nom d'utilisateur masqué");
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("keeps the ClinIA product name unchanged in Norwegian", async () => {
        translateTextMock.mockResolvedValue(
            "Le terme \"ClinIA\" semble être un nom propre ou un acronyme spécifique."
        );

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.app.landing.title,
                targetLang: "no-NO",
                namespace: "app-landing",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("ClinIA");
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("keeps short OpenAI log count labels stable in Vietnamese", async () => {
        translateTextMock.mockResolvedValue(
            "Le mot \"logs\" peut se traduire en vietnamien selon le contexte."
        );

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.openAiLogs.status.logPlural,
                targetLang: "vi",
                namespace: "openai-logs",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("logs");
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("uses the approved translation key and falls back to English when the cache misses", async () => {
        translateTextMock.mockRejectedValue(new Error("Translation API error"));

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.app.landing.doctorLoginTitle,
                targetLang: "en-CA",
                translationKey: "app.landing.doctorLoginTitle",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Doctor sign-in");
        expect(result.current.error).toBe("Translation API error");
        expect(translateTextMock).toHaveBeenCalledWith({
            translationKey: "app.landing.doctorLoginTitle",
            targetLang: "en-CA",
        });
    });

    it("keeps the cached-analysis notice in English when its approved cache entry is unavailable", async () => {
        translateTextMock.mockRejectedValue(new Error("Translation cache miss"));

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.clinicalDemo.cachedResultNotice.title,
                targetLang: "en-CA",
                translationKey: "clinicalDemo.cachedResultNotice.title",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Equivalent analysis already available");
        expect(translateTextMock).toHaveBeenCalledWith({
            translationKey: "clinicalDemo.cachedResultNotice.title",
            targetLang: "en-CA",
        });
    });

    it("does not send an unapproved dynamic label to the backend", async () => {
        translateTextMock.mockClear();
        const { result } = renderHook(() =>
            useTranslation({
                text: "Texte clinique dynamique qui ne doit jamais quitter le navigateur",
                targetLang: "en-CA",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe(
            "Texte clinique dynamique qui ne doit jamais quitter le navigateur"
        );
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("does not let an old English translation overwrite a newer French locale", async () => {
        let resolveEnglishTranslation: ((value: string) => void) | null = null;
        translateTextMock.mockImplementation(
            () =>
                new Promise<string>((resolve) => {
                    resolveEnglishTranslation = resolve;
                })
        );

        const { result, rerender } = renderHook(
            ({ targetLang }) =>
                useTranslation({
                    text: labels.app.landing.doctorLoginTitle,
                    targetLang,
                    translationKey: "app.landing.doctorLoginTitle",
                }),
            {
                initialProps: { targetLang: "en-CA" },
            }
        );

        rerender({ targetLang: "fr-CA" });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Connexion médecin");

        if (resolveEnglishTranslation) {
            (resolveEnglishTranslation as (value: string) => void)("Doctor sign-in");
        }

        await waitFor(() => {
            expect(result.current.translated).toBe("Connexion médecin");
        });
    });
});
