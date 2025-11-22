import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mocksPath = path.join(__dirname, "..", "mocks", "clinicalMocks.json");

let MOCK_DATA = null;

// Charger le fichier JSON une seule fois
function loadMocks() {
    if (MOCK_DATA) return MOCK_DATA;

    const raw = fs.readFileSync(mocksPath, "utf8");
    MOCK_DATA = JSON.parse(raw);

    return MOCK_DATA;
}

// Trouver le mock selon le diagnostic
export function getMockForDiagnosis(diagnosis = "") {
    const mocks = loadMocks();
    const d = diagnosis.toLowerCase();

    for (const key of Object.keys(mocks)) {
        const entry = mocks[key];

        if (!entry.match) continue;

        if (entry.match.some((m) => d.includes(m.toLowerCase()))) {
            return {
                patient_summary: entry.patient_summary,
                treatments: entry.treatments
            };
        }
    }

    // Fallback générique
    const fallback = mocks["_fallback"];
    return {
        patient_summary: fallback.patient_summary,
        treatments: fallback.treatments
    };
}
