import { describe, expect, it } from 'vitest';
import { UI_LABELS_FR } from './uiLabels.fr';
import { passwordPolicyLabels, passwordPolicyTranslations } from './passwordPolicyLabels';

describe('password policy language selector', () => {
    it.each(['fr-CA', 'en-CA', 'es', 'ko-KR', 'vi', 'no-NO', 'ja', 'zh', 'he'])(
        'selects the versioned UI label for %s', (locale) => {
            const selected = passwordPolicyLabels(locale);
            expect(selected).toBe(passwordPolicyTranslations[locale.split('-')[0]]);
            expect(selected.tooLong).toContain('72');
            expect(selected.tooLong).toContain('UTF-8');
        },
    );
    it('uses the French source and handles case or unsupported locales', () => {
        expect(passwordPolicyLabels('FR-ca')).toBe(UI_LABELS_FR.auth.passwordPolicy);
        expect(passwordPolicyLabels('unknown')).toBe(passwordPolicyTranslations.en);
        expect(Object.keys(passwordPolicyTranslations)).toHaveLength(9);
    });
});
