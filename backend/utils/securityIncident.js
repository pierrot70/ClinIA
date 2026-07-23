const RAMQ_REGEX = /\b(?:RAMQ\d{10}|[A-Z]{4}\d{8})\b/i;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_REGEX = /\b(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;
const DOB_REGEX = /\b(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b/;
const ADDRESS_REGEX = /\b\d{1,6}\s+[A-Z0-9.'\-\s]{2,}\s(?:rue|street|st\.?|avenue|ave\.?|boulevard|blvd\.?|road|rd\.?|chemin|ch\.?|route|apt|appartement)\b/i;
const NAME_LABEL_REGEX = /\b(?:nom|prenom|name|first\s*name|last\s*name|patient\s*name)\s*[:=-]\s*[A-Z][A-Z\-']+(?:\s+[A-Z][A-Z\-']+){0,2}/i;

const NAME_KEYS = new Set([
    "nom",
    "prenom",
    "name",
    "firstname",
    "lastname",
    "first_name",
    "last_name",
    "patientname",
    "patient_name",
]);

const ADDRESS_KEYS = new Set([
    "addresse",
    "address",
    "street",
    "rue",
    "city",
    "ville",
    "postalcode",
    "postal_code",
    "zip",
]);

const DOB_KEYS = new Set([
    "dob",
    "dateofbirth",
    "date_of_birth",
    "birthdate",
    "date_naissance",
]);

const PHONE_KEYS = new Set([
    "phone",
    "telephone",
    "tel",
    "mobile",
    "cell",
]);

const EMAIL_KEYS = new Set([
    "email",
    "courriel",
    "mail",
]);

const RAMQ_KEYS = new Set([
    "num_assurance_maladie",
    "ramq",
    "ramqnumber",
    "ramq_number",
]);

const SENSITIVE_REPLACEMENTS = [
    { regex: EMAIL_REGEX, replacement: "[REDACTED_EMAIL]" },
    { regex: PHONE_REGEX, replacement: "[REDACTED_PHONE]" },
    { regex: RAMQ_REGEX, replacement: "[REDACTED_RAMQ]" },
    { regex: DOB_REGEX, replacement: "[REDACTED_DOB]" },
    { regex: ADDRESS_REGEX, replacement: "[REDACTED_ADDRESS]" },
    { regex: NAME_LABEL_REGEX, replacement: "[REDACTED_NAME]" },
];

function normalizeKey(input) {
    return String(input || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function pushMatch(matches, type, path) {
    matches.push({
        type,
        path,
    });
}

function scanString(value, path, matches) {
    if (EMAIL_REGEX.test(value)) {
        pushMatch(matches, "email", path);
    }

    if (PHONE_REGEX.test(value)) {
        pushMatch(matches, "phone", path);
    }

    if (RAMQ_REGEX.test(value)) {
        pushMatch(matches, "ramq", path);
    }

    if (DOB_REGEX.test(value)) {
        pushMatch(matches, "dob", path);
    }

    if (ADDRESS_REGEX.test(value)) {
        pushMatch(matches, "address", path);
    }

    if (NAME_LABEL_REGEX.test(value)) {
        pushMatch(matches, "name", path);
    }
}

function scanNode(node, path, matches) {
    if (node === null || node === undefined) {
        return;
    }

    if (typeof node === "string") {
        scanString(node, path, matches);
        return;
    }

    if (typeof node !== "object") {
        return;
    }

    if (Array.isArray(node)) {
        node.forEach((value, index) => {
            scanNode(value, `${path}[${index}]`, matches);
        });
        return;
    }

    Object.entries(node).forEach(([key, value]) => {
        const normalizedKey = normalizeKey(key);
        const nodePath = path ? `${path}.${key}` : key;

        if (typeof value === "string" && value.trim()) {
            if (NAME_KEYS.has(normalizedKey)) {
                pushMatch(matches, "name", nodePath);
            }

            if (ADDRESS_KEYS.has(normalizedKey)) {
                pushMatch(matches, "address", nodePath);
            }

            if (DOB_KEYS.has(normalizedKey) || DOB_REGEX.test(value)) {
                pushMatch(matches, "dob", nodePath);
            }

            if (PHONE_KEYS.has(normalizedKey) || PHONE_REGEX.test(value)) {
                pushMatch(matches, "phone", nodePath);
            }

            if (EMAIL_KEYS.has(normalizedKey) || EMAIL_REGEX.test(value)) {
                pushMatch(matches, "email", nodePath);
            }

            if (RAMQ_KEYS.has(normalizedKey) || RAMQ_REGEX.test(value)) {
                pushMatch(matches, "ramq", nodePath);
            }
        }

        scanNode(value, nodePath, matches);
    });
}

export function detectNonSecureContent(payload) {
    const matches = [];
    scanNode(payload, "payload", matches);

    const uniqueMatches = [];
    const seen = new Set();
    for (const match of matches) {
        const key = `${match.type}|${match.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueMatches.push(match);
    }

    return {
        hasMatches: uniqueMatches.length > 0,
        matches: uniqueMatches,
    };
}

export function buildBlockingIncidentResponse(incident) {
    return {
        error: {
            code: "SECURITY_INCIDENT_BLOCKING",
            message:
                "Contenu non securise detecte. Une acknowledgment explicite est obligatoire avant de continuer.",
            retryable: false,
            action: "ACK_REQUIRED",
        },
        blocking: {
            required: true,
            incident: {
                id: String(incident?._id || incident?.id || ""),
                type: incident?.type || "NON_SECURE_CONTENT",
                reason: incident?.reason || "Patient identifier detected",
                phase: incident?.phase || "pre_cloud",
                timestamp:
                    incident?.detectedAt ||
                    incident?.createdAt ||
                    new Date().toISOString(),
                context: incident?.context || {},
                matches: Array.isArray(incident?.matches)
                    ? incident.matches
                    : [],
            },
            acknowledgment: {
                requiredAction: "J'ai lu et compris",
                method: "POST",
                endpoint: "/api/security/incidents/acknowledge",
            },
            userMessage:
                "Le contenu detecte contient des identifiants patients. Veuillez confirmer explicitement 'J'ai lu et compris' pour continuer.",
        },
    };
}

function sanitizeString(value) {
    let sanitized = String(value ?? "");
    for (const entry of SENSITIVE_REPLACEMENTS) {
        sanitized = sanitized.replace(entry.regex, entry.replacement);
    }
    return sanitized;
}

function sanitizeNode(node, keyName = "") {
    if (node === null || node === undefined) {
        return node;
    }

    const normalizedKey = normalizeKey(keyName);
    const keyIsSensitive =
        NAME_KEYS.has(normalizedKey) ||
        ADDRESS_KEYS.has(normalizedKey) ||
        DOB_KEYS.has(normalizedKey) ||
        PHONE_KEYS.has(normalizedKey) ||
        EMAIL_KEYS.has(normalizedKey) ||
        RAMQ_KEYS.has(normalizedKey);

    if (typeof node === "string") {
        if (keyIsSensitive) {
            if (NAME_KEYS.has(normalizedKey)) return "[REDACTED_NAME]";
            if (ADDRESS_KEYS.has(normalizedKey)) return "[REDACTED_ADDRESS]";
            if (DOB_KEYS.has(normalizedKey)) return "[REDACTED_DOB]";
            if (PHONE_KEYS.has(normalizedKey)) return "[REDACTED_PHONE]";
            if (EMAIL_KEYS.has(normalizedKey)) return "[REDACTED_EMAIL]";
            if (RAMQ_KEYS.has(normalizedKey)) return "[REDACTED_RAMQ]";
        }
        return sanitizeString(node);
    }

    if (Array.isArray(node)) {
        return node.map((item) => sanitizeNode(item, keyName));
    }

    if (typeof node === "object") {
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            out[key] = sanitizeNode(value, key);
        }
        return out;
    }

    return node;
}

export function sanitizeNonSecureContent(payload) {
    return sanitizeNode(payload);
}
