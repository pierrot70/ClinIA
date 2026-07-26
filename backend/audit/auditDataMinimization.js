const MAX_COUNT = 10_000;
const SAFE_PHASES = new Set(["pre_cloud", "post_cloud", "client_enforcement"]);
const SAFE_IDENTIFIER_TYPES = new Set(["email", "phone", "ramq", "dob", "address", "name"]);

function nonEmptyString(value, maxLength = 128) {
    return typeof value === "string" && value.trim()
        ? value.trim().slice(0, maxLength)
        : "";
}

function boundedCount(value) {
    return Number.isFinite(value) && value >= 0
        ? Math.min(Math.floor(value), MAX_COUNT)
        : undefined;
}

export function minimizePatientAuditContext(context) {
    if (!context || typeof context !== "object") return null;
    const secureRequest = context.secureRequest;
    const clinicalNoteVersion = context.clinicalNoteVersion;
    const result = {};

    if (secureRequest && typeof secureRequest === "object") {
        const selectedDocumentCount = Array.isArray(secureRequest.selectedDocumentIds)
            ? secureRequest.selectedDocumentIds.filter((value) => typeof value === "string" && value.trim()).length
            : boundedCount(secureRequest.selectedDocumentCount) ?? 0;
        result.secureRequest = {
            objectiveProvided: secureRequest.objectiveProvided === true ||
                Boolean(nonEmptyString(secureRequest.objective, 500)),
            clinicalScopeProvided: secureRequest.clinicalScopeProvided === true ||
                Boolean(nonEmptyString(secureRequest.clinicalScope, 160)),
            selectedDocumentCount,
        };
    }

    if (clinicalNoteVersion && typeof clinicalNoteVersion === "object") {
        const changeType = nonEmptyString(clinicalNoteVersion.changeType, 32).toUpperCase();
        if (["BASELINE", "UPDATE", "RESTORE"].includes(changeType)) {
            result.clinicalNoteVersion = { changeType };
        }
    }

    return Object.keys(result).length ? result : null;
}

export function minimizeOpenAIRequestContext(context) {
    if (!context || typeof context !== "object") return {};
    const result = {};
    for (const key of ["fingerprint", "diagnosisHash", "cloudPayloadProfile"]) {
        const value = nonEmptyString(context[key]);
        if (value) result[key] = value;
    }
    for (const key of ["symptomCount", "medicalHistoryCount", "currentMedicationCount", "detectedIdentifierCount"]) {
        const value = boundedCount(context[key]);
        if (value !== undefined) result[key] = value;
    }
    for (const key of ["forceReal", "neutralized", "blockedBeforeCloud"]) {
        if (typeof context[key] === "boolean") result[key] = context[key];
    }
    const phase = nonEmptyString(context.securityIncidentPhase, 32);
    if (SAFE_PHASES.has(phase)) result.securityIncidentPhase = phase;
    const direction = nonEmptyString(context.direction, 16);
    if (["request", "response"].includes(direction)) result.direction = direction;
    if (Array.isArray(context.detectedIdentifierTypes)) {
        const types = [...new Set(context.detectedIdentifierTypes
            .filter((value) => typeof value === "string")
            .map((value) => value.toLowerCase())
            .filter((value) => SAFE_IDENTIFIER_TYPES.has(value)))];
        if (types.length) result.detectedIdentifierTypes = types;
    }
    return result;
}

export function minimizeSecurityIncidentMatches(matches) {
    if (!Array.isArray(matches)) return [];
    const unique = new Set();
    return matches.flatMap((match) => {
        const type = nonEmptyString(match?.type, 32).toLowerCase();
        const path = nonEmptyString(match?.path, 160);
        if (!SAFE_IDENTIFIER_TYPES.has(type) || !path) return [];
        const key = `${type}|${path}`;
        if (unique.has(key)) return [];
        unique.add(key);
        return [{ type, path }];
    });
}

export function minimizeSecurityIncidentContext(type, context) {
    if (!context || typeof context !== "object") return {};
    if (["MASS_DOWNLOAD_ATTEMPT", "REFRESH_TOKEN_REPLAY"].includes(type)) {
        const result = {};
        const userId = nonEmptyString(context.userId, 48);
        if (userId) result.userId = userId;
        for (const key of ["totalCost", "threshold", "eventCost", "windowMs", "incidentsCreated"]) {
            const value = boundedCount(context[key]);
            if (value !== undefined) result[key] = value;
        }
        const role = nonEmptyString(context.role, 32);
        if (["MEDECIN", "ADMIN", "SUPERADMIN"].includes(role)) result.role = role;
        return result;
    }
    const result = {};
    const model = nonEmptyString(context.model, 80);
    if (model) result.model = model;
    const direction = nonEmptyString(context.direction, 16);
    if (["request", "response"].includes(direction)) result.direction = direction;
    const directive = nonEmptyString(context.directive, 64);
    if (directive) result.directive = directive;
    const resource = nonEmptyString(context.resource, 32);
    if (resource) result.resource = resource;
    return result;
}

export function minimizeAcknowledgmentContext(context) {
    if (!context || typeof context !== "object") return {};
    const result = {};
    const route = nonEmptyString(context.route, 120);
    if (route && /^\/(clinical|results|patients|security)(?:\/|$)/.test(route)) result.route = route;
    const source = nonEmptyString(context.source, 64);
    if (["header", "clinical-analysis", "results"].includes(source)) result.source = source;
    return result;
}
