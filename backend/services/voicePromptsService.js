export const VOICE_PROMPTS_SOURCE_FR = {
    dictationInstruction: "Dites ou ecrivez votre diagnostic.",
};

const DICTATION_PROMPT_BY_LANG = {
    fr: "Dites ou ecrivez votre diagnostic.",
    en: "Please dictate or type your diagnosis.",
    es: "Por favor, dicte o escriba su diagnostico.",
    de: "Bitte diktieren oder schreiben Sie Ihre Diagnose.",
    it: "Per favore, detti o scriva la sua diagnosi.",
    pt: "Por favor, dite ou escreva seu diagnostico.",
    ja: "Shindan o onsei de nyuryoku suru ka, nyuryoku shite kudasai.",
    ko: "Jindaneul malhagena ibryeokhae juseyo.",
    zh: "Qing koushu huo shuru nin de zhenduan.",
};

const VOICE_ACK_LABELS = {
    en: "english",
    es: "spanish",
    de: "german",
    it: "italian",
    pt: "portuguese",
    ja: "japanese",
    ko: "korean",
    zh: "chinese",
    ar: "arabic",
    ru: "russian",
    hi: "hindi",
    tr: "turkish",
    nl: "dutch",
    sv: "swedish",
    no: "norwegian",
    da: "danish",
    fi: "finnish",
    pl: "polish",
    cs: "czech",
    ro: "romanian",
    el: "greek",
    he: "hebrew",
    id: "indonesian",
    vi: "vietnamese",
    th: "thai",
};

export function buildVoicePrompts(langCode) {
    const normalized = String(langCode || "fr")
        .trim()
        .toLowerCase()
        .slice(0, 2);

    return {
        dictationInstruction:
            DICTATION_PROMPT_BY_LANG[normalized] ||
            DICTATION_PROMPT_BY_LANG.en,
    };
}

export function hasVoicePromptsShape(obj) {
    return (
        obj &&
        typeof obj === "object" &&
        typeof obj.dictationInstruction === "string" &&
        obj.dictationInstruction.trim().length > 0
    );
}

export function buildVoiceAck(langCode) {
    const normalized = String(langCode || "fr")
        .trim()
        .toLowerCase()
        .slice(0, 2);

    if (normalized === "fr") {
        return "Retour en francais.";
    }

    const label = VOICE_ACK_LABELS[normalized] || normalized;
    return `Back in ${label}.`;
}
