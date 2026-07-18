function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

function normalizeIdentifier(value) {
    return String(value || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

export const HEALTH_INSURANCE_JURISDICTIONS = [
    "AB",
    "BC",
    "MB",
    "NB",
    "NL",
    "NS",
    "NT",
    "NU",
    "ON",
    "PE",
    "QC",
    "SK",
    "YT",
    "UNKNOWN",
];

export const PATIENT_COUNTRIES = ["CA"];

export function normalizePatientCountry(value) {
    const country = String(value || "").trim().toUpperCase();
    return PATIENT_COUNTRIES.includes(country) ? country : "CA";
}

export function normalizeHealthInsuranceJurisdiction(value, number = "") {
    const jurisdiction = String(value || "").trim().toUpperCase();
    if (HEALTH_INSURANCE_JURISDICTIONS.includes(jurisdiction)) {
        return jurisdiction;
    }

    return normalizeIdentifier(number).startsWith("RAMQ") ? "QC" : "UNKNOWN";
}

export function buildPatientSearchKeys(patient = {}) {
    const healthInsuranceNumberSearch = normalizeIdentifier(
        patient.num_assurance_maladie
    );

    return {
        nomSearch: normalizeText(patient.nom),
        prenomSearch: normalizeText(patient.prenom),
        addresseSearch: normalizeText(patient.addresse),
        telephoneSearch: normalizeIdentifier(patient.telephone),
        healthInsuranceNumberSearch: healthInsuranceNumberSearch || null,
    };
}

export function normalizePatientTextSearch(value) {
    return normalizeText(value);
}

export function normalizePatientIdentifierSearch(value) {
    return normalizeIdentifier(value);
}
