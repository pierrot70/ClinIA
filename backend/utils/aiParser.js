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
            console.error("Final JSON parse failed:", err2);
            // ✅ retourne un objet neutre (et le backend normalise)
            return {};
        }
    }
}
