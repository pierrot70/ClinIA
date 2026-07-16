import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCachedTranslation } = vi.hoisted(() => ({
    getCachedTranslation: vi.fn(),
}));

vi.mock("../../services/translationService.js", () => ({
    getCachedTranslation,
}));

import router from "../translation.js";

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

function getHandler() {
    const layer = router.stack.find(
        (entry) => entry.route?.path === "/" && entry.route?.methods?.post
    );

    return layer.route.stack.at(-1).handle;
}

describe("translation route security", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("reads an approved cached UI label by opaque key", async () => {
        getCachedTranslation.mockResolvedValue({ text: "Doctor sign-in" });
        const res = makeRes();

        await getHandler()(
            {
                body: {
                    translationKey: "app.landing.doctorLoginTitle",
                    targetLang: "en-CA",
                },
            },
            res
        );

        expect(getCachedTranslation).toHaveBeenCalledWith({
            text: "Connexion médecin",
            targetLang: "en-CA",
            namespace: "app-landing",
            sourceLocale: "fr",
        });
        expect(res.json).toHaveBeenCalledWith({ translation: "Doctor sign-in" });
    });

    it("rejects a language not offered by the interface", async () => {
        const res = makeRes();

        await getHandler()(
            {
                body: {
                    translationKey: "app.landing.title",
                    targetLang: "attacker-language",
                },
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "INVALID_TRANSLATION_LANGUAGE",
                message: "Langue de traduction non autorisee.",
                retryable: false,
            },
        });
        expect(getCachedTranslation).not.toHaveBeenCalled();
    });

    it("rejects arbitrary text requests without looking in the cache", async () => {
        const res = makeRes();

        await getHandler()(
            { body: { text: "Patient: Jean Dupont", targetLang: "en-CA" } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Missing translationKey or targetLang",
        });
        expect(getCachedTranslation).not.toHaveBeenCalled();
    });

    it("rejects an invented translation key before cache lookup", async () => {
        const res = makeRes();

        await getHandler()(
            {
                body: {
                    translationKey: "patient.notes.pierre-lasante",
                    targetLang: "en-CA",
                },
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "INVALID_TRANSLATION_KEY",
                message: "Libelle de traduction non autorise.",
                retryable: false,
            },
        });
        expect(getCachedTranslation).not.toHaveBeenCalled();
    });

    it("rejects runtime cache writes", async () => {
        const res = makeRes();

        await getHandler()(
            {
                body: {
                    translationKey: "app.landing.title",
                    targetLang: "en",
                    translated: "Attacker text",
                    forceSave: true,
                },
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "TRANSLATION_CACHE_READ_ONLY",
                message: "Le cache de traduction est en lecture seule.",
                retryable: false,
            },
        });
        expect(getCachedTranslation).not.toHaveBeenCalled();
    });

    it("does not create a translation when the approved cache entry is missing", async () => {
        getCachedTranslation.mockRejectedValue({
            code: "TRANSLATION_CACHE_MISS",
            message: "Traduction non disponible dans le cache local.",
        });
        const res = makeRes();

        await getHandler()(
            {
                body: {
                    translationKey: "app.landing.title",
                    targetLang: "en-CA",
                },
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "TRANSLATION_CACHE_MISS",
                message: "Traduction non disponible dans le cache local.",
                retryable: false,
            },
        });
    });
});
