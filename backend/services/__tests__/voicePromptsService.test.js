import { describe, expect, it } from "vitest";

import {
    VOICE_PROMPTS_SOURCE_FR,
    buildVoiceAck,
    buildVoicePrompts,
    hasVoicePromptsShape,
} from "../voicePromptsService.js";

describe("voicePromptsService", () => {
    it("returns the French source prompt and French voice ack for fr", () => {
        expect(VOICE_PROMPTS_SOURCE_FR).toEqual({
            dictationInstruction: "Dites ou ecrivez votre diagnostic.",
        });
        expect(buildVoicePrompts("fr")).toEqual(VOICE_PROMPTS_SOURCE_FR);
        expect(buildVoiceAck("fr")).toBe("Retour en francais.");
    });

    it("falls back to English prompts and builds a readable voice ack", () => {
        expect(buildVoicePrompts("xx")).toEqual({
            dictationInstruction: "Please dictate or type your diagnosis.",
        });
        expect(buildVoiceAck("es")).toBe("Back in spanish.");
    });

    it("validates the expected voice prompt shape", () => {
        expect(
            hasVoicePromptsShape({
                dictationInstruction: "Please dictate or type your diagnosis.",
            })
        ).toBe(true);
        expect(hasVoicePromptsShape({})).toBe(false);
    });
});
