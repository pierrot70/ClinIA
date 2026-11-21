// Call the exported steps with a Chrome tab and disposable staging fixtures:
// { ips: { username, password }, physician: { username, password },
//   patient: { surname, firstName, updatedFirstName, originalNote } }.
// The disposable family physician must opt in to new patients on the transfers page before the IPS step.
// The split steps allow a reviewer to inspect the pending and read-only screens.
const staging = "http://localhost:5174";
const visible = { state: "visible", timeout: 15000 };
const button = (page, name) => page.getByRole("button", { name, exact: true });
const heading = (page, name) => page.getByRole("heading", { name, exact: true });

async function stagingPage(tab, fixture) {
    const { origin } = new URL(await tab.url());
    if (origin !== staging || !/^DEMO-TRANSFERT-[A-F0-9]{12}$/.test(fixture.patient.surname)
        || !/^demo_transfert_[a-f0-9]{12}_ips$/.test(fixture.ips.username)
        || fixture.physician.username !== fixture.ips.username.replace(/_ips$/, "_famille")) {
        throw new Error("Utiliser l’onglet staging et les comptes fictifs de cette démonstration.");
    }
    return tab.playwright;
}

async function confirmIdentity(page, account, role) {
    await page.getByText(account.username, { exact: true }).waitFor(visible);
    await page.getByText(role, { exact: true }).waitFor(visible);
}

async function connect(tab, page, account, role) {
    if (new URL(await tab.url()).pathname !== "/login") {
        await page.expectNavigation(() => tab.goto(staging + "/login"), { url: staging + "/login", waitUntil: "load" });
    }
    await heading(page, "Connexion ClinIA").waitFor(visible);
    await page.getByRole("textbox", { name: "Identifiant (courriel ou nom d'utilisateur)", exact: true }).fill(account.username);
    await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
    await button(page, "Se connecter").click();
    await confirmIdentity(page, account, role);
}

async function logout(tab, page, account, role) {
    await confirmIdentity(page, account, role);
    await button(page, "Déconnexion").click();
    await page.waitForURL(staging + "/", { timeout: 15000, waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Connexion", exact: true }).waitFor(visible);
}

const patientCard = (page, surname) => page.getByRole("row").or(page.getByRole("article"))
    .filter({ hasText: surname, visible: true });

export async function sendTransfer(tab, fixture) {
    const page = await stagingPage(tab, fixture);
    await connect(tab, page, fixture.ips, "IPS");
    await tab.goto(staging + "/patients");
    await button(patientCard(page, fixture.patient.surname), "Transférer ce dossier").click();
    await heading(page, "Demander un transfert de dossier").waitFor(visible);
    await page.getByRole("combobox", { name: "Médecin de famille destinataire" }).selectOption({
        label: fixture.physician.option,
    });
    if (await button(page, "Envoyer la demande").isEnabled()) throw new Error("Le consentement doit précéder l’envoi.");
    await page.getByRole("checkbox", { name: /Je confirme que le patient a donné son accord/ }).check();
    await button(page, "Envoyer la demande").click();
    await page.getByText("Demande envoyée.", { exact: true }).waitFor(visible);
    await page.getByText("En attente", { exact: true }).waitFor(visible);
}

export async function reviewTransfer(tab, fixture) {
    const page = await stagingPage(tab, fixture);
    if (new URL(await tab.url()).pathname !== "/login") await logout(tab, page, fixture.ips, "IPS");
    await connect(tab, page, fixture.physician, "MEDECIN");
    await tab.goto(staging + "/clinical-care-transfer");
    const request = page.getByRole("listitem").filter({ hasText: fixture.patient.surname });
    await button(request, "Consulter le dossier en lecture seule").click();
    await heading(page, fixture.patient.firstName + " " + fixture.patient.surname).waitFor(visible);
    await page.getByText(fixture.patient.originalNote, { exact: true }).waitFor(visible);
    if (await page.getByRole("textbox").count() || await button(page, "Enregistrer").count()) {
        throw new Error("Un champ modifiable est disponible pendant la lecture seule.");
    }
}

export async function acceptTransfer(tab, fixture) {
    const page = await stagingPage(tab, fixture);
    await confirmIdentity(page, fixture.physician, "MEDECIN");
    await heading(page, fixture.patient.firstName + " " + fixture.patient.surname).waitFor(visible);
    await button(page, "Accepter le transfert").click();
    await page.getByText("Transfert accepté. Vous êtes maintenant responsable du dossier.", { exact: true }).waitFor(visible);
    await page.getByRole("link", { name: "Ouvrir mes dossiers patients", exact: true }).click();
}

export async function editTransferredPatient(tab, fixture) {
    const page = await stagingPage(tab, fixture);
    await confirmIdentity(page, fixture.physician, "MEDECIN");
    await heading(page, "Patients").waitFor(visible);
    const surname = page.getByPlaceholder("Nom *", { exact: true });
    if (!await surname.isVisible()) await button(patientCard(page, fixture.patient.surname), "Éditer").click();
    await surname.waitFor(visible);
    if (!await surname.evaluate((input, expected) => input.value === expected, fixture.patient.surname)) {
        throw new Error("Le formulaire doit être ouvert sur le dossier fictif transféré.");
    }
    await page.getByPlaceholder("Prénom *", { exact: true }).fill(fixture.patient.updatedFirstName);
    await button(page, "Enregistrer").click();
    await page.getByRole("status").filter({ hasText: "Modifications du patient sauvegardées avec succès." }).waitFor(visible);
}

export async function logoutDemo(tab, fixture) {
    const page = await stagingPage(tab, fixture);
    await logout(tab, page, fixture.physician, "MEDECIN");
}

export async function runDemo(tab, fixture, checkpoint = () => undefined) {
    await sendTransfer(tab, fixture);
    await checkpoint("demande-ips");
    await reviewTransfer(tab, fixture);
    await checkpoint("lecture-seule");
    await acceptTransfer(tab, fixture);
    await editTransferredPatient(tab, fixture);
    await checkpoint("modification-medecin");
}
