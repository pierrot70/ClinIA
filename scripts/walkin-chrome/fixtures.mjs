import assert from 'node:assert/strict';

const orders = [
    ['appel', 'SMS', 'courriel'],
    ['appel', 'courriel', 'SMS'],
    ['SMS', 'appel', 'courriel'],
    ['SMS', 'courriel', 'appel'],
    ['courriel', 'appel', 'SMS'],
    ['courriel', 'SMS', 'appel'],
];

export const scenarios = ['existant', 'nouveau'].flatMap(type => orders.map((order, letterIndex) => ({
    type, order, letter: String.fromCharCode(65 + letterIndex),
})));

export function buildMatrix(seed, revision) {
    assert.match(revision, /^[0-9a-f]{40}$/, 'SHA applicatif complet requis.');
    return scenarios.map(({ type, order, letter }, index) => {
        const suffix = String(seed + index);
        const phone = offset => '+1 514-555-' + String(100 + index * 4 + offset).padStart(4, '0');
        return {
            scenario: index + 1, type, order, insurance: 'WLFX' + suffix,
            first: 'Essai', last: (type === 'existant' ? 'patient' : 'walkin') + '_' + letter + '_' + revision.slice(0, 8),
            email: 'apres-passe-' + suffix + '@example.invalid',
            oldEmail: 'avant-passe-' + suffix + '@example.invalid',
            phone: phone(0), sms: phone(1), oldPhone: phone(2), oldSms: phone(3),
        };
    });
}
