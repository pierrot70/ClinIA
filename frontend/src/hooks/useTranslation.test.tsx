import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { labels } from "../i18n/uiLabels";
import { supportInboxFrench, supportInboxTranslations } from "../i18n/supportAccessInboxLabels";
import { useTranslation } from "./useTranslation";
import { commentsPageFrench, commentsPageTranslations } from "../i18n/commentsPageLabels";
import { appointmentCreationRows } from "../i18n/appointmentCreationLabels";
import { patientAdministrativeLabels, patientFormRows } from "../i18n/patientPageFallbacks";

const { translateTextMock } = vi.hoisted(() => ({
    translateTextMock: vi.fn(),
}));

vi.mock("../services/translationApi", () => ({
    translateText: translateTextMock,
}));

describe("useTranslation", () => {
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"].flatMap((locale, index) =>
        patientFormRows.map(row => ({ locale, source: row[0], expected: row[index] }))
    ))("switches patient form label '$source' to $locale", async ({ locale, source, expected }) => {
        const { result, rerender } = renderHook(({ targetLang }) => useTranslation({ text: source, targetLang, namespace: "patients-page" }), { initialProps: { targetLang: "fr-CA" } });
        rerender({ targetLang: locale });
        await waitFor(() => expect(result.current.translated).toBe(expected));
        expect(expected).toBeTruthy();
        rerender({ targetLang: "fr-CA" });
        await waitFor(() => expect(result.current.translated).toBe(source));
        expect(translateTextMock).not.toHaveBeenCalled();
    });
    it.each(Object.entries(patientAdministrativeLabels).flatMap(([locale, translated]) =>
        patientAdministrativeLabels.fr.map((source, index) => ({ locale, source, expected: translated[index] }))
    ))("localizes patient administrative label '$source' in $locale", async ({ locale, source, expected }) => {
        const { result, rerender } = renderHook(({ targetLang }) => useTranslation({ text: source, targetLang, namespace: "patients-page" }), { initialProps: { targetLang: "fr-CA" } });
        rerender({ targetLang: locale });
        await waitFor(() => expect(result.current.translated).toBe(expected));
        expect(expected).toBeTruthy();
        expect(translateTextMock).not.toHaveBeenCalled();
    });
    it.each([
        ["fr-CA", "patient trouvé", "patients trouvés"],
        ["en-CA", "patient found", "patients found"],
        ["es", "paciente encontrado", "pacientes encontrados"],
        ["ko-KR", "명의 환자를 찾았습니다", "명의 환자를 찾았습니다"],
        ["vi", "bệnh nhân được tìm thấy", "bệnh nhân được tìm thấy"],
        ["no-NO", "pasient funnet", "pasienter funnet"],
        ["ja", "人の患者が見つかりました", "人の患者が見つかりました"],
        ["zh", "位患者已找到", "位患者已找到"],
        ["he", "מטופל נמצא", "מטופלים נמצאו"],
    ])("localizes patient result counts in %s", async (locale, singular, plural) => {
        const { result, rerender } = renderHook(({ targetLang }) => ({
            singular: useTranslation({ text: labels.patientsPage.search.resultSingular, targetLang, namespace: "patients-page" }).translated,
            plural: useTranslation({ text: labels.patientsPage.search.resultPlural, targetLang, namespace: "patients-page" }).translated,
        }), { initialProps: { targetLang: "fr-CA" } });
        rerender({ targetLang: locale });
        await waitFor(() => expect(result.current).toEqual({ singular, plural }));
        for (const count of [0, 1, 4]) {
            expect(`${count} ${count === 1 ? result.current.singular : result.current.plural}`)
                .toBe(`${count} ${count === 1 ? singular : plural}`);
        }
        expect(translateTextMock).not.toHaveBeenCalled();
    });
    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"].flatMap((locale, index) =>
        appointmentCreationRows.map(row => ({ locale, source: row[0], expected: row[index] }))
    ))("switches appointment UI '$source' to $locale locally", async ({ locale, source, expected }) => {
        expect(expected).toBeTruthy();
        const { result, rerender } = renderHook(({ targetLang }) => useTranslation({ text: source, targetLang, namespace: "appointments-page" }), { initialProps: { targetLang: "fr-CA" } });
        expect(result.current.translated).toBe(source);
        rerender({ targetLang: locale });
        await waitFor(() => expect(result.current.translated).toBe(expected));
        rerender({ targetLang: "fr-CA" });
        await waitFor(() => expect(result.current.translated).toBe(source));
        expect(translateTextMock).not.toHaveBeenCalled();
    });
    it.each(Object.entries(commentsPageTranslations).flatMap(([locale, translated]) =>
        Object.entries(commentsPageFrench).map(([key, source]) => ({ locale, key, source,
            expected: translated[key as keyof typeof commentsPageFrench] }))
    ))("uses a local comments-page translation for $key in $locale", async ({ locale, source, expected }) => {
        expect(expected).toBeTruthy();
        const { result, rerender } = renderHook(({ targetLang }) => useTranslation({ text: source, targetLang, namespace: "comments-page" }), { initialProps: { targetLang: "fr-CA" } });
        rerender({ targetLang: locale });
        await waitFor(() => expect(result.current.translated).toBe(expected));
        expect(translateTextMock).not.toHaveBeenCalled();
    });
    it.each([
        ["fr-CA", "Accès de soutien"], ["en-CA", "Support access"],
        ["es", "Acceso de soporte"], ["ko", "지원 접근"],
        ["vi", "Quyền truy cập hỗ trợ"], ["no", "Støttetilgang"],
        ["ja", "サポートアクセス"], ["zh", "支持访问"], ["he", "גישה לצורך תמיכה"],
    ])("localizes support navigation and preserves AI mode identifiers in %s", async (locale, expected) => {
        const { result, rerender } = renderHook(({ locale }) => ({
            navigation: useTranslation({ text: labels.header.nav.supportAccessInbox, targetLang: locale, translationKey: "header.nav.supportAccessInbox" }),
            mock: useTranslation({ text: labels.header.aiMode.mock, targetLang: locale, translationKey: "header.aiMode.mock" }),
            real: useTranslation({ text: labels.header.aiMode.real, targetLang: locale, translationKey: "header.aiMode.real" }),
        }), { initialProps: { locale: "fr-CA" } });
        rerender({ locale });
        await waitFor(() => {
            expect(result.current.navigation.translated).toBe(expected);
            expect(result.current.mock.translated).toBe("AI mock");
            expect(result.current.real.translated).toBe("AI real");
        });
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    const inboxCases = ["fr-CA", "en-CA", "es", "ko", "vi", "no", "ja", "zh", "he"].flatMap(
        locale => Object.entries(supportInboxFrench).map(([key, source]) => ({
            locale, key, source,
            expected: supportInboxTranslations[locale.split("-")[0]][key as keyof typeof supportInboxFrench],
        }))
    );

    it.each(inboxCases)("switches the support inbox label $key to $locale without the translation service", async ({ locale, source, expected }) => {
        translateTextMock.mockRejectedValue(new Error("Offline"));
        expect(expected).toBeTruthy();
        if (!locale.startsWith("fr")) expect(expected).not.toBe(source);
        const { result, rerender } = renderHook(
            ({ locale }) => useTranslation({ text: source, targetLang: locale }),
            { initialProps: { locale: "fr" } }
        );
        expect(result.current.translated).toBe(source);
        rerender({ locale });
        await waitFor(() => expect(result.current.translated).toBe(expected));
        rerender({ locale: "fr" });
        await waitFor(() => expect(result.current.translated).toBe(source));
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    beforeEach(() => {
        window.localStorage.clear();
        translateTextMock.mockReset();
    });

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

    it("uses the approved local English fallback without a translation request", async () => {
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
        expect(result.current.error).toBeNull();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("uses the approved local English cached-analysis notice without a translation request", async () => {
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
        expect(translateTextMock).not.toHaveBeenCalled();
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

    it("reuses an approved UI translation from persistent browser storage without a network call", async () => {
        window.localStorage.setItem(
            "clinia_ui_translation_v1:clinicalDemo.cachedResultNotice.title|es",
            "Analisis equivalente ya disponible"
        );

        const { result } = renderHook(() =>
            useTranslation({
                text: labels.clinicalDemo.cachedResultNotice.title,
                targetLang: "es",
                translationKey: "clinicalDemo.cachedResultNotice.title",
            })
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.translated).toBe("Analisis equivalente ya disponible");
        expect(translateTextMock).not.toHaveBeenCalled();
    });
});
