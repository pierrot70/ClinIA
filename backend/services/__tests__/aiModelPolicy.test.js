import { afterEach, describe, expect, it, vi } from "vitest";

import {
    assertConfiguredOpenAIModel,
    resolveOpenAIModel,
} from "../aiModelPolicy.js";

describe("ai model policy", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("uses the server-configured model when the client does not request one", () => {
        vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");

        expect(resolveOpenAIModel({ role: "MEDECIN" })).toEqual({
            allowed: true,
            model: "gpt-4.1-mini",
        });
    });

    it("lets a superadmin select a different approved model", () => {
        vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");

        expect(
            resolveOpenAIModel({
                requestedModel: "gpt-4-0613",
                role: "SUPERADMIN",
            })
        ).toEqual({ allowed: true, model: "gpt-4-0613" });
    });

    it("uses the default model only when OPENAI_MODEL is not configured", () => {
        expect(assertConfiguredOpenAIModel(undefined)).toBe("gpt-4.1-mini");
    });

    it("rejects an invalid configured model instead of silently falling back", () => {
        expect(() => assertConfiguredOpenAIModel("gpt-typo")).toThrow(
            "OPENAI_MODEL must be one of"
        );
    });
});
