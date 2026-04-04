/* ------------------------------------------------------------------ */
/* Patient DTO                                                         */
/* ------------------------------------------------------------------ */

function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return ["true", "1", "yes", "oui"].includes(
            value.trim().toLowerCase()
        );
    }
    return false;
}

function normalizeSecureRequestProfile(value) {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    return {
        objective: value.objective?.trim() ?? "",
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
export function toCreatePatientDTO(body) {
    const telephoneRaw = body.telephone?.trim();
    return {
        nom: body.nom?.trim(),
        prenom: body.prenom?.trim(),
        num_assurance_maladie:
            body.num_assurance_maladie?.trim(),
        addresse: body.addresse?.trim() ?? "",
        telephone:
            telephoneRaw && telephoneRaw.length > 0
                ? telephoneRaw
                : undefined,
        courriel: body.courriel?.trim() ?? "",
        created_by_reference:
            body.created_by_reference?.trim() ?? "",
        texto: normalizeBoolean(body.texto),
        lat: typeof body.lat === "number" ? body.lat : undefined,
        long: typeof body.long === "number" ? body.long : undefined,
        secure_request_profile: normalizeSecureRequestProfile(
            body.secure_request_profile
        ),
    };
}

export function toUpdatePatientDTO(body) {
    const dto = {};

    if (body.nom !== undefined) dto.nom = body.nom?.trim();
    if (body.prenom !== undefined)
        dto.prenom = body.prenom?.trim();
    if (body.num_assurance_maladie !== undefined)
        dto.num_assurance_maladie =
            body.num_assurance_maladie?.trim();
    if (body.addresse !== undefined)
        dto.addresse = body.addresse?.trim() ?? "";
    if (body.telephone !== undefined) {
        const tel = body.telephone?.trim();
        if (tel && tel.length > 0) {
            dto.telephone = tel;
        }
    }
    if (body.courriel !== undefined)
        dto.courriel = body.courriel?.trim() ?? "";
    if (body.created_by_reference !== undefined) {
        dto.created_by_reference =
            body.created_by_reference?.trim() ?? "";
    }
    if (body.texto !== undefined)
        dto.texto = normalizeBoolean(body.texto);
    if (body.lat !== undefined)
        dto.lat =
            typeof body.lat === "number" ? body.lat : undefined;
    if (body.long !== undefined)
        dto.long =
            typeof body.long === "number" ? body.long : undefined;
    if (body.secure_request_profile !== undefined) {
        dto.secure_request_profile = normalizeSecureRequestProfile(
            body.secure_request_profile
        );
    }

    return dto;
}
