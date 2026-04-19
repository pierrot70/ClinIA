const LABELED_IDENTIFIER_PATTERNS = [
    "nom",
    "prenom",
    "prénom",
    "first name",
    "last name",
    "patient",
    "patient name",
    "ville",
    "city",
    "pays",
    "country",
    "telephone",
    "tel",
    "phone",
    "courriel",
    "email",
    "ramq",
    "ssn",
    "nas",
    "social insurance number",
];

const GENERIC_PATTERNS = [
    {
        type: "EMAIL",
        regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        replacement: "[EMAIL_OBFUSQUE]",
    },
    {
        type: "PHONE",
        regex: /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
        replacement: "[TELEPHONE_OBFUSQUE]",
    },
    {
        type: "RAMQ",
        regex: /\b[A-Z]{4}\s?\d{8,10}\b/gi,
        replacement: "[RAMQ_OBFUSQUE]",
    },
    {
        type: "SSN_NAS",
        regex: /\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/g,
        replacement: "[SSN_OU_NAS_OBFUSQUE]",
    },
];

function obfuscateNamePart(value) {
    const token = String(value || "").trim();
    if (token.length <= 2) {
        return `${token.charAt(0)}*`;
    }

    return `${token.charAt(0)}***${token.charAt(token.length - 1)}`;
}

function pushRedaction(redactions, type, original) {
    redactions.push({
        type,
        original,
    });
}

export function obfuscateClinicianComment(input) {
    const source = String(input || "");
    let sanitized = source;
    const redactions = [];

    for (const label of LABELED_IDENTIFIER_PATTERNS) {
        const regex = new RegExp(
            `(\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*[:=-]\\s*)([^\\n]+)`,
            "gi"
        );

        sanitized = sanitized.replace(regex, (_match, prefix, value) => {
            const trimmedValue = String(value || "").trim();
            if (trimmedValue) {
                pushRedaction(redactions, "LABELED_IDENTIFIER", trimmedValue);
            }

            return `${prefix}[VALEUR_OBFUSQUEE]`;
        });
    }

    for (const pattern of GENERIC_PATTERNS) {
        sanitized = sanitized.replace(pattern.regex, (match) => {
            pushRedaction(redactions, pattern.type, match);
            return pattern.replacement;
        });
    }

    sanitized = sanitized.replace(
        /\b([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]{2,})\s+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]{2,})\b/g,
        (match, firstName, lastName) => {
            const normalizedMatch = String(match || "").trim();
            if (!normalizedMatch) {
                return match;
            }

            pushRedaction(redactions, "PERSON_NAME", normalizedMatch);
            return `${obfuscateNamePart(firstName)} ${obfuscateNamePart(lastName)}`;
        }
    );

    return {
        sanitized,
        redactionCount: redactions.length,
        redactionTypes: Array.from(new Set(redactions.map((entry) => entry.type))),
    };
}
