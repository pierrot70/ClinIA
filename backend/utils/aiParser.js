export function safeParseMedicalAI(text) {
    try {
        return JSON.parse(text);
    } catch (err1) {
        console.warn("JSON parse failed, attempting cleanup…");

        const cleaned = text
            .replace(/(\w+):/g, '"$1":')
            .replace(/“|”/g, '"')
            .replace(/'/g, '"')
            .replace(/,(\s*[}\]])/g, '$1')
            .replace(/^[^({\[]*/, '')
            .replace(/[^)}\]]*$/, '');

        try {
            return JSON.parse(cleaned);
        } catch (err2) {
            console.error("Final JSON parse failed:", err2);
            return {
                error: true,
                raw: text,
                cleaned
            };
        }
    }
}
