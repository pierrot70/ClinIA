/* ------------------------------------------------------------------ */
/* Clinique DTO                                                       */
/* ------------------------------------------------------------------ */

function parseCoordinate(value) {
    if (value === undefined || value === null) return undefined;

    const normalized =
        typeof value === "number" ? value : value?.toString().trim();

    if (normalized === "") {
        return undefined;
    }

    const candidate =
        typeof normalized === "number"
            ? normalized
            : Number(normalized);

    if (Number.isFinite(candidate)) {
        return candidate;
    }

    return undefined;
}

function normalizePostalCode(value) {
    return value?.trim().toUpperCase() || undefined;
}

export function toCreateCliniqueDTO(body) {
    return {
        nom: body.nom?.trim(),
        num_civique: body.num_civique?.trim(),
        rue: body.rue?.trim(),
        code_postal: normalizePostalCode(body.code_postal),
        lat: parseCoordinate(body.lat),
        long: parseCoordinate(body.long),
    };
}

export function toUpdateCliniqueDTO(body) {
    const dto = {};

    if (body.num_civique !== undefined) {
        dto.num_civique = body.num_civique?.trim();
    }
    if (body.rue !== undefined) {
        dto.rue = body.rue?.trim();
    }
    if (body.code_postal !== undefined) {
        dto.code_postal = normalizePostalCode(body.code_postal);
    }
    if (body.nom !== undefined) {
        dto.nom = body.nom?.trim();
    }
    if (body.lat !== undefined) {
        dto.lat = parseCoordinate(body.lat);
    }
    if (body.long !== undefined) {
        dto.long = parseCoordinate(body.long);
    }

    return dto;
}
