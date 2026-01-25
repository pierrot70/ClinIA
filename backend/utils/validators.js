const RAMQ_REGEX = /^RAMQ\d{10}$/;

export function isValidRamq(value) {
    return typeof value === "string" && RAMQ_REGEX.test(value);
}

export { RAMQ_REGEX };
