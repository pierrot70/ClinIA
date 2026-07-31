import { AUTH_ROLES } from "../auth/constants.js";

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const APPROVED_OPENAI_MODELS = new Set([
    "gpt-4.1-mini",
    "gpt-4-0613",
]);

function normalizeModel(value) {
    return typeof value === "string" ? value.trim() : "";
}

export function getConfiguredOpenAIModel() {
    return assertConfiguredOpenAIModel(process.env.OPENAI_MODEL);
}

export function assertConfiguredOpenAIModel(configuredValue) {
    const configuredModel = normalizeModel(configuredValue);

    if (!configuredModel) {
        return DEFAULT_OPENAI_MODEL;
    }

    if (!APPROVED_OPENAI_MODELS.has(configuredModel)) {
        throw new Error(
            `OPENAI_MODEL must be one of: ${[...APPROVED_OPENAI_MODELS].join(", ")}.`
        );
    }

    return configuredModel;
}

export function resolveOpenAIModel({ requestedModel, role }) {
    const configuredModel = getConfiguredOpenAIModel();
    const requested = normalizeModel(requestedModel);

    if (!requested || requested === configuredModel) {
        return { allowed: true, model: configuredModel };
    }

    if (!APPROVED_OPENAI_MODELS.has(requested)) {
        return {
            allowed: false,
            status: 400,
            code: "INVALID_OPENAI_MODEL",
            message: "Modele OpenAI non autorise.",
        };
    }

    if (role !== AUTH_ROLES.SUPERADMIN) {
        return {
            allowed: false,
            status: 403,
            code: "OPENAI_MODEL_OVERRIDE_FORBIDDEN",
            message: "Seul un SUPERADMIN peut choisir un autre modele OpenAI approuve.",
        };
    }

    return { allowed: true, model: requested };
}
