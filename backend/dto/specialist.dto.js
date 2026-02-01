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

function normalizeSpecialite(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed;
    }
    return undefined;
}

function normalizeDisponibilites(value) {
    if (value === null) return [];
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return "__invalid__";

    const parsed = value.map((item) => {
        if (!item) return null;
        if (typeof item === "string" || item instanceof Date) {
            const date = new Date(item);
            if (Number.isNaN(date.getTime())) return null;
            return date;
        }
        return null;
    });

    if (parsed.some((item) => item === null)) {
        return "__invalid__";
    }

    return parsed;
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
        specialite: normalizeSpecialite(body.specialite),
        disponibilites: normalizeDisponibilites(body.disponibilites),
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
    if (body.specialite !== undefined)
        dto.specialite = normalizeSpecialite(body.specialite);
    if (body.disponibilites !== undefined)
        dto.disponibilites = normalizeDisponibilites(
            body.disponibilites
        );

    return dto;
}
