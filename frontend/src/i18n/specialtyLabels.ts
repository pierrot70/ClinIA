type SpecialtyLabels = {
    fr: string;
    en: string;
    es: string;
};

const specialties: Record<string, SpecialtyLabels> = {
    "medecin de famille": { fr: "Médecin de famille", en: "Family Physician", es: "Médico de familia" },
    ophtalmologue: { fr: "Ophtalmologue", en: "Ophthalmologist", es: "Oftalmólogo" },
    cardiologue: { fr: "Cardiologue", en: "Cardiologist", es: "Cardiólogo" },
    pneumologue: { fr: "Pneumologue", en: "Pulmonologist", es: "Neumólogo" },
    neurologue: { fr: "Neurologue", en: "Neurologist", es: "Neurólogo" },
    endocrinologue: { fr: "Endocrinologue", en: "Endocrinologist", es: "Endocrinólogo" },
    nephrologue: { fr: "Néphrologue", en: "Nephrologist", es: "Nefrólogo" },
    rhumatologue: { fr: "Rhumatologue", en: "Rheumatologist", es: "Reumatólogo" },
};

function specialtyKey(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

/**
 * Controlled medical terminology. Only French and Spanish have approved local
 * display names; every other locale deliberately uses the English term.
 */
export function displaySpecialty(value: string, locale: string) {
    const specialty = specialties[specialtyKey(value)];
    if (!specialty) return value.trim();

    const language = locale.toLowerCase().split("-")[0];
    return language === "fr" ? specialty.fr : language === "es" ? specialty.es : specialty.en;
}
