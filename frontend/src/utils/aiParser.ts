export interface ParsedAI {
    options: string[];
    contraindications: string[];
    summary: string[];
    raw: string;
}

export function parseAIResponse(text: string): ParsedAI {
    const lines = text.split("\n").map(l => l.trim());

    const result: ParsedAI = {
        options: [],
        contraindications: [],
        summary: [],
        raw: text
    };

    let current: "options" | "contra" | "summary" | null = null;

    for (const line of lines) {
        // Section détectée
        if (line.match(/option/i) || line.match(/traitement/i)) {
            current = "options";
            continue;
        }
        if (line.match(/contre/i)) {
            current = "contra";
            continue;
        }
        if (line.match(/résumé/i) || line.match(/resume/i)) {
            current = "summary";
            continue;
        }

        // Ajouter dans la bonne section
        if (line.startsWith("-") || line.startsWith("•")) {
            if (current === "options") result.options.push(line.substring(1).trim());
            if (current === "contra") result.contraindications.push(line.substring(1).trim());
            continue;
        }

        // Résumé = phrases normales
        if (current === "summary" && line.length > 0) {
            result.summary.push(line);
        }
    }

    return result;
}

export function extractTreatmentRows(text: string) {
    const rows = [];

    const blocks = text
        .split(/\n\s*\n/) // séparation par paragraphes
        .map(b => b.trim())
        .filter(b => b.length > 0);

    for (const block of blocks) {
        const nameMatch = block.match(/^[-•]?\s*([A-Za-zéèêàïîôç \(\)\/0-9]+)/);
        if (!nameMatch) continue;

        const name = nameMatch[1];

        const justification = block.includes("Justification")
            ? block.split("Justification")[1].split("Contre")[0].trim()
            : "";

        const contraindications = block.includes("Contre-indications")
            ? block.split("Contre-indications")[1].trim()
            : "";

        if (name && (justification || contraindications)) {
            rows.push({
                name,
                justification: justification || "-",
                contraindications: contraindications || "-",
            });
        }
    }

    return rows;
}
