/* ------------------------------------------------------------------ */
/* Patient DTO                                                         */
/* ------------------------------------------------------------------ */

import {
    HEALTH_INSURANCE_JURISDICTIONS,
    normalizeHealthInsuranceJurisdiction,
    normalizePatientCountry,
} from "../utils/patientSearchKeys.js";

const PATIENT_FIELD_LIMITS = Object.freeze({
    nom: 100,
    prenom: 100,
    addresse: 255,
    telephone: 32,
    courriel: 254,
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE_ALLOWED_CHARACTERS_PATTERN = /^\+?[\d().\s-]+$/u;

function invalidInput(message) {
    return { code: "INVALID_INPUT", message };
}

function normalizeBoundedString(value, field, fallback = "") {
    if (value === undefined) return fallback;

    if (typeof value !== "string") {
        throw invalidInput(`Le champ ${field} doit être du texte.`);
    }

    const normalized = value.trim();
    if (normalized.length > PATIENT_FIELD_LIMITS[field]) {
        throw invalidInput(
            `Le champ ${field} ne peut pas dépasser ${PATIENT_FIELD_LIMITS[field]} caractères.`
        );
    }

    return normalized;
}

function normalizeTelephone(value) {
    const telephone = normalizeBoundedString(value, "telephone", undefined);
    if (telephone === undefined || telephone === "") return undefined;

    const digitCount = (telephone.match(/\d/g) ?? []).length;
    if (
        !PHONE_ALLOWED_CHARACTERS_PATTERN.test(telephone) ||
        digitCount < 7 ||
        digitCount > 15
    ) {
        throw invalidInput("Le numéro de téléphone est invalide.");
    }

    return telephone;
}

function normalizeEmail(value) {
    const courriel = normalizeBoundedString(value, "courriel", "");
    if (courriel && !EMAIL_PATTERN.test(courriel)) {
        throw invalidInput("L'adresse courriel est invalide.");
    }

    return courriel;
}

function normalizeCoordinate(value, field, minimum, maximum) {
    if (value === undefined || value === null) return value;

    if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum
    ) {
        throw invalidInput(`La coordonnée ${field} est invalide.`);
    }

    return value;
}

function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return ["true", "1", "yes", "oui"].includes(
            value.trim().toLowerCase()
        );
    }
    return false;
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(
        new Set(
            value
                .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
                .filter(Boolean)
        )
    );
}

function normalizeOptionalNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
}

function normalizePatientLanguage(value, defaultValue) {
    if (typeof value !== "string") {
        return defaultValue;
    }

    const language = value.trim().toLowerCase();
    if (language === "sp") {
        return "es";
    }

    return ["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"].includes(language)
        ? language
        : defaultValue;
}

function normalizePatientHealthInsuranceJurisdiction(value, number, fallback) {
    const jurisdiction = normalizeHealthInsuranceJurisdiction(value, number);
    return HEALTH_INSURANCE_JURISDICTIONS.includes(jurisdiction)
        ? jurisdiction
        : fallback;
}

function normalizeClinicalAnalysisParameters(value) {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    const bloodPressure = value.blood_pressure;
    const diabetesContext = value.diabetes_context;

    return {
        age: normalizeOptionalNumber(value.age),
        sex: value.sex?.trim() ?? "",
        country: value.country?.trim() ?? "",
        ethnicity: value.ethnicity?.trim() ?? "",
        diagnosis: value.diagnosis?.trim() ?? "",
        weight: normalizeOptionalNumber(value.weight),
        height: normalizeOptionalNumber(value.height),
        blood_pressure:
            bloodPressure && typeof bloodPressure === "object"
                ? {
                    systolic: normalizeOptionalNumber(bloodPressure.systolic),
                    diastolic: normalizeOptionalNumber(bloodPressure.diastolic),
                }
                : undefined,
        symptoms: normalizeStringArray(value.symptoms),
        medical_history: normalizeStringArray(value.medical_history),
        current_medications: normalizeStringArray(value.current_medications),
        diabetes_context:
            diabetesContext && typeof diabetesContext === "object"
                ? {
                    cardiovascular_risk: diabetesContext.cardiovascular_risk?.trim() ?? "",
                    renal_function: diabetesContext.renal_function?.trim() ?? "",
                    fragility: diabetesContext.fragility?.trim() ?? "",
                    tolerance: diabetesContext.tolerance?.trim() ?? "",
                    glycemic_goals: diabetesContext.glycemic_goals?.trim() ?? "",
                }
                : undefined,
    };
}

function normalizeSecureRequestProfile(value) {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    return {
        objective: value.objective?.trim() ?? "",
        sex: value.sex?.trim() ?? "",
        age: value.age?.trim() ?? "",
        current_medications: value.current_medications?.trim() ?? "",
        clinicalAnalysisParameters: normalizeClinicalAnalysisParameters(
            value.clinicalAnalysisParameters
        ),
        selected_document_ids: normalizeStringArray(
            value.selected_document_ids
        ),
        clinicalScope: value.clinicalScope?.trim() ?? "",
        ageGroup: value.ageGroup?.trim() ?? "",
        symptomProfile: value.symptomProfile?.trim() ?? "",
        cancerType: value.cancerType?.trim() ?? "",
        duration: value.duration?.trim() ?? "",
        severity: value.severity?.trim() ?? "",
        redFlagStatus: value.redFlagStatus?.trim() ?? "",
        comorbidityContext: value.comorbidityContext?.trim() ?? "",
        clinicalNotes: value.clinicalNotes?.trim() ?? "",
        privacyAttestation: normalizeBoolean(value.privacyAttestation),
        lastRequestedAt:
            value.lastRequestedAt !== undefined
                ? new Date(value.lastRequestedAt)
                : undefined,
    };
}

/**
 * Transforme un req.body brut en DTO contrôlé
 * - supprime les champs inconnus
 * - applique les defaults
 * - garantit une forme stable pour la couche service
 */
export function toCreatePatientDTO(body = {}) {
    return {
        nom: normalizeBoundedString(body.nom, "nom", undefined),
        prenom: normalizeBoundedString(body.prenom, "prenom", undefined),
        num_assurance_maladie:
            body.num_assurance_maladie?.trim(),
        country: normalizePatientCountry(body.country),
        healthInsuranceJurisdiction: normalizePatientHealthInsuranceJurisdiction(
            body.healthInsuranceJurisdiction,
            body.num_assurance_maladie,
            "UNKNOWN"
        ),
        addresse: normalizeBoundedString(body.addresse, "addresse"),
        telephone: normalizeTelephone(body.telephone),
        courriel: normalizeEmail(body.courriel),
        created_by_reference:
            body.created_by_reference?.trim() ?? "",
        texto: normalizeBoolean(body.texto),
        language: normalizePatientLanguage(body.language, "fr"),
        lat: normalizeCoordinate(body.lat, "latitude", -90, 90),
        long: normalizeCoordinate(body.long, "longitude", -180, 180),
        secure_request_profile: normalizeSecureRequestProfile(
            body.secure_request_profile
        ),
    };
}

export function toUpdatePatientDTO(body = {}) {
    const dto = {};

    if (body.nom !== undefined)
        dto.nom = normalizeBoundedString(body.nom, "nom", undefined);
    if (body.prenom !== undefined)
        dto.prenom = normalizeBoundedString(body.prenom, "prenom", undefined);
    if (body.num_assurance_maladie !== undefined)
        dto.num_assurance_maladie =
            body.num_assurance_maladie?.trim();
    if (body.country !== undefined) {
        dto.country = normalizePatientCountry(body.country);
    }
    if (body.healthInsuranceJurisdiction !== undefined) {
        dto.healthInsuranceJurisdiction =
            normalizePatientHealthInsuranceJurisdiction(
                body.healthInsuranceJurisdiction,
                body.num_assurance_maladie,
                "UNKNOWN"
            );
    }
    if (body.addresse !== undefined)
        dto.addresse = normalizeBoundedString(body.addresse, "addresse");
    if (body.telephone !== undefined) {
        const tel = normalizeTelephone(body.telephone);
        if (tel && tel.length > 0) {
            dto.telephone = tel;
        }
    }
    if (body.courriel !== undefined)
        dto.courriel = normalizeEmail(body.courriel);
    if (body.created_by_reference !== undefined) {
        dto.created_by_reference =
            body.created_by_reference?.trim() ?? "";
    }
    if (body.texto !== undefined)
        dto.texto = normalizeBoolean(body.texto);
    if (body.language !== undefined)
        dto.language = normalizePatientLanguage(body.language, "fr");
    if (body.lat !== undefined)
        dto.lat = normalizeCoordinate(body.lat, "latitude", -90, 90);
    if (body.long !== undefined)
        dto.long = normalizeCoordinate(body.long, "longitude", -180, 180);
    if (body.secure_request_profile !== undefined) {
        dto.secure_request_profile = normalizeSecureRequestProfile(
            body.secure_request_profile
        );
    }

    return dto;
}

export function toArchivePatientDTO(body = {}) {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
        throw {
            code: "INVALID_INPUT",
            message: "Une raison d'archivage est requise.",
        };
    }

    if (reason.length > 500) {
        throw {
            code: "INVALID_INPUT",
            message: "La raison d'archivage ne peut pas dépasser 500 caractères.",
        };
    }

    return { reason };
}

export function toRestorePatientDTO(body = {}) {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
        throw {
            code: "INVALID_INPUT",
            message: "Une raison de réactivation est requise.",
        };
    }

    if (reason.length > 500) {
        throw {
            code: "INVALID_INPUT",
            message: "La raison de réactivation ne peut pas dépasser 500 caractères.",
        };
    }

    return { reason };
}
