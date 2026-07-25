import { logSafeError } from "./requestLogSafety.js";

export function safeParseMedicalAI(text) {
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err1) {
        console.warn("JSON parse failed, attempting cleanup…");

        const cleaned = String(text)
            .replace(/(\w+):/g, '"$1":')
            .replace(/“|”/g, '"')
            .replace(/'/g, '"')
            .replace(/,(\s*[}\]])/g, "$1")
            .replace(/^[^({\[]*/, "")
            .replace(/[^)}\]]*$/, "");

        try {
            const parsed2 = JSON.parse(cleaned);
            return parsed2 && typeof parsed2 === "object" ? parsed2 : {};
        } catch (err2) {
            logSafeError("AI_RESPONSE_JSON_PARSE_FAILED", err2, {
                component: "openai",
            });
            // ✅ retourne un objet neutre (et le backend normalise)
            return {};
        }
    }
}
