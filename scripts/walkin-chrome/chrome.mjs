const clinicName = 'Clinique fictive WalkIn b07ba073';
const fieldNames = {
    appel: 'Numéro de téléphone',
    SMS: 'Numéro pour les SMS',
    courriel: 'Adresse courriel',
};
const channels = { appel: 'phone', SMS: 'sms', courriel: 'email' };
const errors = {
    appel: 'Le numéro de téléphone est invalide.',
    SMS: 'Le numéro pour les SMS est invalide.',
};
const invalidValues = { appel: '123', SMS: '456', courriel: 'courriel-invalide' };

export async function selectTestClinic(tab) {
    const url = new URL(await tab.url());
    if (url.origin !== 'https://clinique-ai.ca' || url.pathname !== '/walk-in-arrival') {
        throw new Error('Ouvrir le parcours WalkIn en production dans Chrome.');
    }
    const page = tab.playwright;
    await page.getByText('receptioncool1', { exact: true }).waitFor({ state: 'visible', timeoutMs: 8000 });
    await page.getByText('RECEPTION', { exact: true }).waitFor({ state: 'visible', timeoutMs: 8000 });
    const clinic = page.getByRole('button', { name: clinicName, exact: true });
    const active = page.getByText('Clinique active : ' + clinicName, { exact: true });
    await clinic.or(active).waitFor({ state: 'visible', timeoutMs: 8000 });
    if (await clinic.isVisible()) await clinic.click();
    await active.waitFor({ state: 'visible', timeoutMs: 8000 });
}

export async function runScenario(tab, fixture) {
    const page = tab.playwright;
    const field = kind => page.getByLabel(fieldNames[kind], { exact: true });
    const button = name => page.getByRole('button', { name, exact: true });
    const positive = page.getByRole('status').filter({ hasText: 'Le patient a été inscrit sur la liste d’attente.' });
    const waitVisible = locator => locator.waitFor({ state: 'visible', timeoutMs: 8000 });
    const corrected = { appel: fixture.phone, SMS: fixture.sms, courriel: fixture.email };

    try {
        await waitVisible(page.getByText('Clinique active : ' + clinicName, { exact: true }));
        const insurance = page.locator('#walk-in-ramq');
        await insurance.fill(fixture.insurance);
        if (!await insurance.evaluate((el, value) => el.value === value, fixture.insurance)) {
            throw new Error('Le numéro saisi ne correspond plus au numéro du scénario.');
        }
        await button('Rechercher le patient').click({ timeoutMs: 8000 });
        if (fixture.type === 'existant') {
            await page.getByRole('button', { name: new RegExp(fixture.last) }).click({ timeoutMs: 8000 });
            await button('Voir les créneaux disponibles').click({ timeoutMs: 8000 });
        } else {
            await waitVisible(page.getByRole('heading', { name: 'Nouveau patient', exact: true }));
        }
        await page.getByRole('button', { name: /chercher jusqu’à 200 km/ }).click({ timeoutMs: 8000 });
        await button('Inscrire sur la liste d’attente').click({ timeoutMs: 8000 });
        await page.getByLabel('Mode de contact choisi').selectOption(channels[fixture.order[2]]);
        if (fixture.type === 'nouveau') {
            await page.getByLabel('Prénom', { exact: true }).fill(fixture.first);
            await page.getByLabel('Nom', { exact: true }).fill(fixture.last);
        }
        for (const [kind, value] of Object.entries(invalidValues)) await field(kind).fill(value);
        await page.getByRole('checkbox', { name: /Le patient accepte/ }).check();
    } catch (error) {
        throw new Error(`Scénario ${fixture.scenario}, ouverture du formulaire. ${error.message}`);
    }

    for (let phase = 0; phase <= 3; phase++) {
        try {
            if (phase) {
                const kind = fixture.order[phase - 1];
                await field(kind).fill(corrected[kind]);
            }
            await button('Enregistrer l’inscription').click({ timeoutMs: 8000 });
            if (phase === 3) {
                await waitVisible(positive);
                return { scenario: fixture.scenario, refus: 3, inscription: true };
            }
            if (await positive.isVisible()) throw new Error('Inscription prématurée.');
            const remaining = fixture.order.slice(phase);
            if (remaining.includes('courriel')) {
                const emailBlocked = await field('courriel').evaluate(el =>
                    el.validity.typeMismatch && el === el.ownerDocument.activeElement);
                if (!emailBlocked) throw new Error('Le refus du courriel n’est pas affiché.');
            } else {
                for (const kind of ['appel', 'SMS']) {
                    const alert = page.getByRole('alert').filter({ hasText: errors[kind] });
                    if (remaining.includes(kind)) {
                        await alert.waitFor({ state: 'visible', timeoutMs: 2500 });
                    } else if (await alert.isVisible()) {
                        throw new Error(`Le champ ${kind} est encore signalé après sa correction.`);
                    }
                }
            }
        } catch (error) {
            throw new Error(`Scénario ${fixture.scenario}, tentative ${phase + 1}. ${error.message}`);
        }
    }
}
