import { describe, expect, it } from 'vitest';
import { exceedsNewPasswordByteLimit } from './passwordPolicy';

describe('new password UTF-8 byte limit', () => {
    it.each([
        ['ASCII boundary', 'a'.repeat(72), false],
        ['ASCII overflow', 'a'.repeat(73), true],
        ['accent boundary', 'é'.repeat(36), false],
        ['accent overflow', 'é'.repeat(36) + 'a', true],
        ['emoji boundary', '🔐'.repeat(18), false],
        ['emoji overflow', '🔐'.repeat(18) + 'a', true],
        ['combining boundary', 'e\u0301'.repeat(24), false],
        ['no normalization', 'e\u0301'.repeat(25), true],
        ['CJK overflow', '密'.repeat(25), true],
        ['blank for generated password', '', false],
        ['spaces count', 'a'.repeat(72) + ' ', true],
    ])('%s', (_name, password, expected) => {
        expect(exceedsNewPasswordByteLimit(password)).toBe(expected);
    });
});
