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

/**
 * Transforme un req.body brut en DTO contrôlé
 * - supprime les champs inconnus
 * - applique les defaults
 * - garantit une forme stable pour la couche service
 */
export function toCreatePatientDTO(body) {
    return {
        nom: body.nom?.trim(),
        prenom: body.prenom?.trim(),
        num_assurance_maladie:
            body.num_assurance_maladie?.trim(),
        addresse: body.addresse?.trim() ?? "",
        telephone: body.telephone?.trim() ?? "",
        courriel: body.courriel?.trim() ?? "",
        texto: normalizeBoolean(body.texto),
        lat: typeof body.lat === "number" ? body.lat : undefined,
        long: typeof body.long === "number" ? body.long : undefined,
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
    if (body.telephone !== undefined)
        dto.telephone = body.telephone?.trim() ?? "";
    if (body.courriel !== undefined)
        dto.courriel = body.courriel?.trim() ?? "";
    if (body.texto !== undefined)
        dto.texto = normalizeBoolean(body.texto);
    if (body.lat !== undefined)
        dto.lat =
            typeof body.lat === "number" ? body.lat : undefined;
    if (body.long !== undefined)
        dto.long =
            typeof body.long === "number" ? body.long : undefined;

    return dto;
}
