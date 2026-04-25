import { beforeEach, describe, expect, it, vi } from "vitest";

const countDocuments = vi.fn();
const find = vi.fn();
const findByIdAndUpdate = vi.fn();
const findByIdAndDelete = vi.fn();
const recordAuthAuditEvent = vi.fn();

vi.mock("../../models/UiTranslationCache.js", () => ({
    UiTranslationCache: {
        countDocuments,
        find,
        findByIdAndUpdate,
        findByIdAndDelete,
    },
}));

vi.mock("../../audit/authAudit.js", () => ({
    recordAuthAuditEvent,
}));

const {
    deleteUiTranslation,
    listUiTranslations,
    updateUiTranslation,
} = await import("../translationAdmin.js");

function makeFindChain(docs) {
    return {
        sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue(docs),
                }),
            }),
        }),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("translation admin service", () => {
    it("lists translation cache entries for superadmins", async () => {
        countDocuments.mockResolvedValue(1);
        find.mockReturnValue(
            makeFindChain([
                {
                    _id: "507f1f77bcf86cd799439011",
                    namespace: "clinical-demo",
                    sourceLocale: "fr",
                    targetLang: "en",
                    sourceHash: "hash-1",
                    sourceText: "Diagnostic suspecte",
                    payload: { text: "Suspected diagnosis" },
                    model: "gpt-4.1-mini",
                    createdAt: new Date("2026-04-25T10:00:00.000Z"),
                    updatedAt: new Date("2026-04-25T10:00:00.000Z"),
                },
            ])
        );

        const result = await listUiTranslations({
            authUser: { role: "SUPERADMIN" },
            namespace: "clinical-demo",
            targetLang: "EN",
            search: "diagnostic",
        });

        expect(countDocuments).toHaveBeenCalledWith({
            namespace: "clinical-demo",
            targetLang: "en",
            $or: [
                { sourceText: { $regex: "diagnostic", $options: "i" } },
                { sourceHash: { $regex: "diagnostic", $options: "i" } },
            ],
        });
        expect(result.translations).toHaveLength(1);
        expect(result.translations[0]).toMatchObject({
            id: "507f1f77bcf86cd799439011",
            sourceText: "Diagnostic suspecte",
            payload: { text: "Suspected diagnosis" },
        });
    });

    it("rejects list access for non-superadmins", async () => {
        await expect(
            listUiTranslations({
                authUser: { role: "ADMIN" },
            })
        ).rejects.toMatchObject({
            code: "FORBIDDEN",
        });

        expect(find).not.toHaveBeenCalled();
    });

    it("updates a translation and records audit metadata", async () => {
        findByIdAndUpdate.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439011",
                namespace: "clinical-demo",
                sourceLocale: "fr",
                targetLang: "en",
                sourceHash: "hash-1",
                sourceText: "Hypothese clinique",
                payload: { text: "Clinical hypothesis" },
                model: "manual",
            }),
        });

        const result = await updateUiTranslation({
            authUser: {
                userId: "507f1f77bcf86cd799439099",
                username: "superadmin",
                role: "SUPERADMIN",
            },
            translationId: "507f1f77bcf86cd799439011",
            sourceText: "Hypothese clinique",
            payload: { text: "Clinical hypothesis" },
            req: { ip: "127.0.0.1" },
        });

        expect(findByIdAndUpdate).toHaveBeenCalledWith(
            "507f1f77bcf86cd799439011",
            {
                $set: {
                    payload: { text: "Clinical hypothesis" },
                    model: "manual",
                    sourceText: "Hypothese clinique",
                },
            },
            { new: true }
        );
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "USER_MANAGEMENT",
                outcome: "SUCCESS",
                reason: "TRANSLATION_CACHE_UPDATE",
            })
        );
        expect(result.translation.payload).toEqual({
            text: "Clinical hypothesis",
        });
    });

    it("deletes a translation and records audit metadata", async () => {
        findByIdAndDelete.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439011",
                namespace: "clinical-demo",
                sourceLocale: "fr",
                targetLang: "en",
                sourceHash: "hash-1",
                payload: { text: "Old translation" },
            }),
        });

        const result = await deleteUiTranslation({
            authUser: {
                userId: "507f1f77bcf86cd799439099",
                username: "superadmin",
                role: "SUPERADMIN",
            },
            translationId: "507f1f77bcf86cd799439011",
            req: { ip: "127.0.0.1" },
        });

        expect(findByIdAndDelete).toHaveBeenCalledWith(
            "507f1f77bcf86cd799439011"
        );
        expect(recordAuthAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: "TRANSLATION_CACHE_DELETE",
            })
        );
        expect(result.success).toBe(true);
    });
});
