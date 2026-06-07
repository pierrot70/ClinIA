import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOrCreateTranslation } = vi.hoisted(() => ({
    getOrCreateTranslation: vi.fn(),
}));

vi.mock("../../services/translationService.js", () => ({
    getOrCreateTranslation,
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
        (entry) =>
            entry.route?.path === "/" &&
            entry.route?.methods?.post === true
    );

    return layer.route.stack.at(-1).handle;
}

describe("translation route security", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("allows anonymous users to read cached translations only", async () => {
        getOrCreateTranslation.mockResolvedValue({ text: "Hello" });
        const req = {
            body: {
                text: "Bonjour",
                targetLang: "en",
            },
        };
        const res = makeRes();

        await getHandler()(req, res);

        expect(getOrCreateTranslation).toHaveBeenCalledWith({
            text: "Bonjour",
            targetLang: "en",
            namespace: "clinical-demo",
            sourceLocale: "fr",
            openaiModel: undefined,
            allowCreate: false,
        });
        expect(res.json).toHaveBeenCalledWith({ translation: "Hello" });
    });

    it("allows authenticated users to create a missing translation", async () => {
        getOrCreateTranslation.mockResolvedValue({ text: "Hello" });
        const req = {
            auth: { userId: "user-1", role: "USER" },
            body: {
                text: "Bonjour",
                targetLang: "en",
            },
        };
        const res = makeRes();

        await getHandler()(req, res);

        expect(getOrCreateTranslation).toHaveBeenCalledWith(
            expect.objectContaining({ allowCreate: true })
        );
    });

    it("rejects anonymous forced cache writes", async () => {
        const req = {
            body: {
                text: "Bonjour",
                translated: "Attacker text",
                targetLang: "en",
                forceSave: true,
            },
        };
        const res = makeRes();

        await getHandler()(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(getOrCreateTranslation).not.toHaveBeenCalled();
    });

    it("rejects forced cache writes from non-admin users", async () => {
        const req = {
            auth: { userId: "user-1", role: "USER" },
            body: {
                text: "Bonjour",
                translated: "User text",
                targetLang: "en",
                forceSave: true,
            },
        };
        const res = makeRes();

        await getHandler()(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(getOrCreateTranslation).not.toHaveBeenCalled();
    });
});
