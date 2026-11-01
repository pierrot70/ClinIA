import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerCareSharing } from "./OwnerCareSharing";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../../i18n/homeStrings";
import { clinicalCareAccessLabels } from "../../i18n/clinicalCareAccessLabels";

const api = vi.hoisted(() => ({ eligible: vi.fn(), grants: vi.fn(), notes: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: "ips-owner", role: "IPS" } }));
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../../services/clinicalCareAccessApi", async importOriginal => ({ ...(await importOriginal<object>()), listEligibleCareClinicians: api.eligible, listPatientCareGrants: api.grants, listPatientSharedCareNotes: api.notes, createPatientCareGrant: api.create, revokePatientCareGrant: api.revoke }));
const patient = { _id: "fictional-patient", prenom: "Fictif", nom: "Partage", ownerUserId: "ips-owner" };
const target = { _id: "physician", username: "SyntheticDoctor", professional: { prenom: "Fictif", nom: "Médecin", specialty: "Urgentologue" } };
const grant = { _id: "grant", patientId: patient._id, issuerUserId: "ips-owner", targetUserId: target._id, target: { _id: target._id, username: target.username }, status: "ACTIVE", permission: "READ_APPEND", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() };
function View({ selected = patient }: { selected?: typeof patient }) {
    return <HomeI18nContext.Provider value={{ locale: "en-CA", strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><OwnerCareSharing patient={selected} onClose={vi.fn()} /></HomeI18nContext.Provider>;
}
const t = clinicalCareAccessLabels("en-CA");
beforeEach(() => {
    vi.clearAllMocks(); auth.user = { id: "ips-owner", role: "IPS" };
    api.eligible.mockResolvedValue({ data: [target] }); api.grants.mockResolvedValue({ data: [] }); api.notes.mockResolvedValue({ data: { sharedNotes: [], notesTruncated: false } });
    api.create.mockResolvedValue({ data: grant, meta: {} }); api.revoke.mockResolvedValue({ data: { ...grant, status: "REVOKED" }, meta: {} });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No direct or AI request allowed"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("IPS-owned clinical sharing confirmation", () => {
    it("requires an explicit recipient and confirmation of patient, duration and read/append rights", async () => {
        render(<View />);
        const select = await screen.findByLabelText(t.target);
        expect(screen.getByText(t.patient.replace("{name}", "Fictif Partage"))).toBeVisible();
        expect(screen.getByText(t.rights)).toBeVisible();
        expect(screen.getByText(t.ownerPreserved)).toBeVisible();
        expect(screen.getByLabelText(t.duration)).toHaveValue("60");
        expect(screen.getByRole("button", { name: t.grant })).toBeDisabled();
        expect(api.create).not.toHaveBeenCalled();
        fireEvent.change(select, { target: { value: target._id } });
        fireEvent.click(screen.getByRole("checkbox", { name: t.grantConsent }));
        fireEvent.change(screen.getByLabelText(t.duration), { target: { value: "240" } });
        expect(screen.getByRole("checkbox", { name: t.grantConsent })).not.toBeChecked();
        expect(screen.getByRole("button", { name: t.grant })).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox", { name: t.grantConsent }));
        fireEvent.click(screen.getByRole("button", { name: t.grant }));
        await screen.findByText(t.granted);
        expect(api.create).toHaveBeenCalledTimes(1);
        expect(api.create).toHaveBeenCalledWith(patient._id, target._id, 240);
        expect(fetch).not.toHaveBeenCalled();
    });
    it.each(["RECEPTION", "ADMIN", "SUPERADMIN", "MEDECIN"])("does not expose or load owner sharing for %s", role => {
        auth.user.role = role; render(<View />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(api.eligible).not.toHaveBeenCalled(); expect(api.grants).not.toHaveBeenCalled(); expect(api.notes).not.toHaveBeenCalled();
    });
    it("does not expose a foreign patient to an IPS", () => {
        render(<View selected={{ ...patient, ownerUserId: "other-owner" }} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(api.grants).not.toHaveBeenCalled();
    });
    it("revokes only the chosen active grant and shows the returned status", async () => {
        api.grants.mockResolvedValueOnce({ data: [grant] }).mockResolvedValue({ data: [{ ...grant, status: "REVOKED" }] });
        render(<View />); fireEvent.click(await screen.findByRole("button", { name: t.revoke }));
        await screen.findByText(t.revoked);
        expect(api.revoke).toHaveBeenCalledWith("grant"); expect(api.create).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole("button", { name: t.revoke })).not.toBeInTheDocument());
    });
    it("does not create a grant on a failed load or translate private server errors", async () => {
        api.grants.mockResolvedValue({ error: { code: "FORBIDDEN", message: "Private diagnostic" } });
        render(<View />); expect(await screen.findByRole("alert")).toHaveTextContent(t.unavailable);
        expect(screen.queryByText("Private diagnostic")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: t.grant })).toBeDisabled(); expect(api.create).not.toHaveBeenCalled();
    });
});
