/** bcrypt accepts at most 72 UTF-8 bytes. Never normalize or truncate passwords. */
export const NEW_PASSWORD_MAX_BYTES = 72;

export function exceedsNewPasswordByteLimit(password: string): boolean {
    return new TextEncoder().encode(password).byteLength > NEW_PASSWORD_MAX_BYTES;
}
