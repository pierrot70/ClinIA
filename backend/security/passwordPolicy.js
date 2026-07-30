export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// This local denylist catches common breached-password patterns without sending
// a password or a password-derived value to a third party.
const COMPROMISED_PASSWORDS = new Set([
    "123456789012",
    "adminadminadmin",
    "changeme12345",
    "letmein123456",
    "password1234",
    "passwordpassword",
    "qwertyuiop",
    "welcome123456",
]);

function normalizeForCompromisedPasswordCheck(password) {
    return String(password).trim().toLowerCase().replace(/\s+/g, "");
}

export function getPasswordPolicyViolation(password) {
    if (typeof password !== "string") {
        return "Le mot de passe est invalide.";
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
        return "Le mot de passe doit contenir au moins 12 caracteres ou etre une phrase de passe.";
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
        return "Le mot de passe ne peut pas depasser 128 caracteres.";
    }

    if (COMPROMISED_PASSWORDS.has(normalizeForCompromisedPasswordCheck(password))) {
        return "Ce mot de passe est trop courant ou compromis. Choisissez une phrase de passe differente.";
    }

    return null;
}

export function isPasswordAllowed(password) {
    return getPasswordPolicyViolation(password) === null;
}
