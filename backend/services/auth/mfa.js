import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;

function getMfaEncryptionKey() {
    const configured = process.env.MFA_ENCRYPTION_KEY;
    if (!configured || configured.length < 32) {
        const error = new Error("MFA encryption key is missing.");
        error.code = "MFA_MISCONFIGURED";
        throw error;
    }
    return crypto.createHash("sha256").update(configured).digest();
}

function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = "";
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
}

function base32Decode(secret) {
    const normalized = String(secret || "").replace(/\s|=/g, "").toUpperCase();
    let bits = 0;
    let value = 0;
    const output = [];
    for (const character of normalized) {
        const index = BASE32_ALPHABET.indexOf(character);
        if (index < 0) throw new Error("Invalid MFA secret.");
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}

function totpAt(secret, timestamp) {
    const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 15;
    const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
    return String(value % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, "0");
}

export function createMfaSecret() {
    return base32Encode(crypto.randomBytes(20));
}

export function encryptMfaSecret(secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getMfaEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptMfaSecret(encrypted) {
    const [ivValue, tagValue, ciphertextValue] = String(encrypted || "").split(".");
    if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid MFA secret.");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getMfaEncryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

export function verifyTotp(secret, code, now = Date.now()) {
    if (!/^\d{6}$/.test(String(code || ""))) return false;
    return [-1, 0, 1].some((offset) => crypto.timingSafeEqual(Buffer.from(totpAt(secret, now + offset * TOTP_PERIOD_SECONDS * 1000)), Buffer.from(String(code))));
}

export function createTotp(secret, now = Date.now()) {
    return totpAt(secret, now);
}

export function createRecoveryCodes() {
    return Array.from({ length: 10 }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
}

export function hashRecoveryCode(code) {
    return crypto.createHash("sha256").update(String(code || "").replace(/[^a-z0-9]/gi, "").toUpperCase()).digest("hex");
}

export function buildProvisioningUri({ secret, username }) {
    const account = encodeURIComponent(`ClinIA:${username}`);
    return `otpauth://totp/${account}?secret=${secret}&issuer=ClinIA&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_SECONDS}`;
}

export { MFA_CHALLENGE_TTL_SECONDS };
