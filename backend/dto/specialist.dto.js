/* ------------------------------------------------------------------ */
/* Specialist DTO                                                      */
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

function normalizeCliniqueAssocier(value) {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed;
    }
    return value;
}

export function toCreateSpecialistDTO(body) {
    const telephoneRaw = body.telephone?.trim();

    return {
        nom: body.nom?.trim(),
        prenom: body.prenom?.trim(),
        numero_medecin: body.numero_medecin?.trim(),
        telephone:
            telephoneRaw && telephoneRaw.length > 0
                ? telephoneRaw
                : undefined,
        email: body.email?.trim() ?? "",
        texto: normalizeBoolean(body.texto),
        clinique_associer: normalizeCliniqueAssocier(
            body.clinique_associer
        ),
    };
}

export function toUpdateSpecialistDTO(body) {
    const dto = {};

    if (body.nom !== undefined) dto.nom = body.nom?.trim();
    if (body.prenom !== undefined) dto.prenom = body.prenom?.trim();
    if (body.numero_medecin !== undefined)
        dto.numero_medecin = body.numero_medecin?.trim();
    if (body.telephone !== undefined) {
        const telephoneRaw = body.telephone?.trim();
        if (telephoneRaw && telephoneRaw.length > 0) {
            dto.telephone = telephoneRaw;
        }
    }
    if (body.email !== undefined)
        dto.email = body.email?.trim() ?? "";
    if (body.texto !== undefined)
        dto.texto = normalizeBoolean(body.texto);
    if (body.clinique_associer !== undefined)
        dto.clinique_associer = normalizeCliniqueAssocier(
            body.clinique_associer
        );

    return dto;
}
