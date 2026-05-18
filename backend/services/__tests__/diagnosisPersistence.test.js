import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();

vi.mock("../../models/DiagnosisResult.js", () => ({
    DiagnosisResult: {
        create: mockCreate,
        findOne: mockFindOne,
        updateOne: mockUpdateOne,
    },
}));

const {
    persistOrReuseDiagnosis,
    findPersistedDiagnosisByFingerprint,
    upgradePersistedDiagnosisOutput,
} = await import("../diagnosisPersistence.js");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("diagnosisPersistence", () => {
    it("replaces an existing placeholder real diagnosis with a meaningful real result", async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const existing = {
            mode: "real",
            output: { diagnosis: { suspected: "To be determined" } },
            input: { foo: "old" },
            model: "old-model",
            save,
            toObject: vi.fn(() => ({
                mode: "real",
                output: { diagnosis: { suspected: "Updated diagnosis" } },
                input: { foo: "new" },
                model: "new-model",
            })),
        };

        const duplicateError = new Error("duplicate");
        duplicateError.code = 11000;

        mockCreate.mockRejectedValue(duplicateError);
        mockFindOne.mockResolvedValue(existing);

        const result = await persistOrReuseDiagnosis(
            {
                fingerprint: "abc123",
                input: { foo: "new" },
                output: { diagnosis: { suspected: "Updated diagnosis" } },
                mode: "real",
                model: "new-model",
            },
            {
                isPlaceholderClinicalAnalysis: (output) =>
                    output?.diagnosis?.suspected === "To be determined",
                logger: { error: vi.fn() },
            }
        );

        expect(existing.input).toEqual({ foo: "new" });
        expect(existing.output).toEqual({
            diagnosis: { suspected: "Updated diagnosis" },
        });
        expect(existing.model).toBe("new-model");
        expect(save).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
            ok: true,
            doc: {
                mode: "real",
                output: { diagnosis: { suspected: "Updated diagnosis" } },
                input: { foo: "new" },
                model: "new-model",
            },
        });
    });

    it("returns null when persisted diagnosis lookup fails", async () => {
        mockFindOne.mockReturnValue({
            lean: vi.fn().mockRejectedValue(new Error("mongo down")),
        });

        const result = await findPersistedDiagnosisByFingerprint("abc123", {
            logger: { error: vi.fn() },
        });

        expect(result).toBeNull();
    });

    it("upgrades persisted diagnosis output without exposing model calls to the route", async () => {
        mockUpdateOne.mockResolvedValue({ acknowledged: true });

        const result = await upgradePersistedDiagnosisOutput("abc123", {
            diagnosis: { suspected: "Updated diagnosis" },
        });

        expect(mockUpdateOne).toHaveBeenCalledWith(
            { fingerprint: "abc123" },
            {
                $set: {
                    output: {
                        diagnosis: { suspected: "Updated diagnosis" },
                    },
                },
            }
        );
        expect(result).toBe(true);
    });
});
