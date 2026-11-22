import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runScenario } from "../../../scripts/walkin-chrome/chrome.mjs";
import { buildMatrix } from "../../../scripts/walkin-chrome/fixtures.mjs";
import { WalkInArrivalPage } from "./WalkInArrivalPage";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";

const api = vi.hoisted(() => ({ lookup: vi.fn(), slots: vi.fn(), enroll: vi.fn() }));
const clinic = vi.hoisted(() => ({ _id: "test-clinic", nom: "Clinique fictive WalkIn b07ba073" }));
vi.mock("../services/receptionApi", () => ({
    findReceptionPatientByRamq: api.lookup, fetchWalkInAvailability: api.slots,
}));
vi.mock("../services/receptionWaitlistApi", () => ({ enrollWalkInWaitlist: api.enroll }));
vi.mock("../contexts/ReceptionClinicContext", () => ({
    useReceptionClinic: () => ({ activeClinic: clinic, isLoading: false }),
}));

// Translate the Chrome driver's locator operations into queries on the mounted React page.
function locator(query) {
    function unique() {
        const nodes = query();
        expect(nodes).toHaveLength(1);
        return nodes[0];
    }
    async function ready() {
        return waitFor(() => {
            const node = unique();
            expect(node).toBeVisible();
            expect(node).toBeEnabled();
            return node;
        });
    }
    async function interact(action) {
        const node = await ready();
        await act(async () => { action(node); });
    }
    return {
        filter: ({ hasText }) => locator(() => query().filter(node => node.textContent.includes(hasText))),
        isVisible: () => query().some(node => !node.closest("[hidden]")),
        waitFor: ready,
        evaluate: (fn, arg) => fn(unique(), arg),
        fill: value => interact(node => fireEvent.change(node, { target: { value } })),
        selectOption: value => interact(node => fireEvent.change(node, { target: { value } })),
        click: () => interact(node => fireEvent.click(node)),
        check: () => interact(box => { if (!box.checked) fireEvent.click(box); }),
    };
}
const page = {
    getByRole: (role, options) => locator(() => screen.queryAllByRole(role, options)),
    getByLabel: (label, options) => locator(() => screen.queryAllByLabelText(label, options)),
    getByText: (text, options) => locator(() => screen.queryAllByText(text, options)),
    locator: selector => locator(() => [...document.querySelectorAll(selector)]),
};

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
const fixtures = buildMatrix(30000000, "a".repeat(40));
describe("pilote des 12 scénarios WalkIn sur le formulaire français", () => {
    it.each(fixtures)("scénario $scenario ($type) : $order", async fixture => {
        const existing = fixture.type === "existant";
        api.lookup.mockResolvedValue({ data: existing ? {
            _id: "patient", prenom: fixture.first, nom: fixture.last, bookingProof: "proof", existingAppointments: [],
        } : null });
        const exhausted = maxDistanceKm => ({ data: {
            presentation: "priority", today: [], future: [],
            search: { status: "exhausted", maxDistanceKm, examinedClinics: 1, distanceMode: "straight_line",
                ...(maxDistanceKm === 110 ? { radiusKm: 100, toleranceKm: 10 } : { radiusKm: 200 }) },
        } });
        api.slots.mockResolvedValueOnce(exhausted(110)).mockResolvedValueOnce(exhausted(200));
        api.enroll.mockResolvedValue({ data: { _id: "entry" } });
        vi.stubGlobal("fetch", () => { throw new Error("Requête externe inattendue"); });

        const submitted = [];
        function trackFormClick(event) {
            if (event.target.textContent !== "Enregistrer l’inscription") return;
            submitted.push(["Numéro de téléphone", "Numéro pour les SMS", "Adresse courriel"]
                .map(label => screen.getByLabelText(label).value));
        }
        render(<HomeI18nContext.Provider value={{ locale: "fr-CA", strings: HOME_STRINGS_FR }}>
            <span>Clinique active : {clinic.nom}</span>
            {/* jsdom emits native 'invalid' but has no browser UI to focus the first invalid field. */}
            <div onInvalidCapture={event => event.target.focus()} onClickCapture={trackFormClick}>
                <WalkInArrivalPage />
            </div>
        </HomeI18nContext.Provider>);

        expect(await runScenario({ playwright: page }, fixture))
            .toEqual({ scenario: fixture.scenario, refus: 3, inscription: true });
        const fields = { appel: "123", SMS: "456", courriel: "courriel-invalide" };
        const valid = { appel: fixture.phone, SMS: fixture.sms, courriel: fixture.email };
        const attempts = [Object.values(fields)];
        for (const kind of fixture.order) {
            fields[kind] = valid[kind];
            attempts.push(Object.values(fields));
        }
        expect(submitted).toEqual(attempts);
        expect(api.enroll).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            clinic: clinic._id, consent: true,
            ...(existing ? { patientId: "patient", bookingProof: "proof" } :
                { insuranceNumber: fixture.insurance, prenom: fixture.first, nom: fixture.last }),
            channel: { appel: "phone", SMS: "sms", courriel: "email" }[fixture.order[2]],
            telephone: fixture.phone, telephoneSms: fixture.sms, courriel: fixture.email,
        }));
    });
});
