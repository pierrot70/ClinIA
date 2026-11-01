import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicalCareAccessPage } from "./ClinicalCareAccessPage";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { clinicalCareAccessLabels } from "../i18n/clinicalCareAccessLabels";

const api = vi.hoisted(() => ({ inbox: vi.fn(), read: vi.fn(), append: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: "physician", role: "MEDECIN" } }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../services/clinicalCareAccessApi", async importOriginal => ({ ...(await importOriginal<object>()), listReceivedCareGrants: api.inbox, readSharedCareRecord: api.read, appendSharedCareNote: api.append }));
const patient = { _id: "fictional-patient", prenom: "Fictif", nom: "Collaboration" };
const grant = { _id: "synthetic-grant", patientId: patient._id, issuerUserId: "ips-owner", targetUserId: "physician", status: "ACTIVE", permission: "READ_APPEND", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+3600000).toISOString(), patient };
const record = { grant, patient, profile: { objective: "Authored fictional profile", clinicalNotes: "Original IPS clinical note" }, originalNotes: [{ _id: "original", note: "Original consultation note", authorUserId: "ips-owner", authorRole: null, author: { _id: "ips-owner", username: "SyntheticIPS" }, createdAt: new Date().toISOString() }], sharedNotes: [{ _id: "shared", note: "Earlier appended fictional note", authorUserId: "other-physician", authorRole: "MEDECIN", authorSpecialty: "Urgentologue", author: { _id: "other-physician", username: "SyntheticEmergencyPhysician" }, createdAt: new Date().toISOString() }], notesTruncated: false, canAppendNote: true };
function View() { return <MemoryRouter><HomeI18nContext.Provider value={{ locale: "en-CA", strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><ClinicalCareAccessPage /></HomeI18nContext.Provider></MemoryRouter>; }
const t = clinicalCareAccessLabels("en-CA");
beforeEach(() => {
    vi.clearAllMocks(); auth.user = { id: "physician", role: "MEDECIN" };
    api.inbox.mockResolvedValue({ data: [structuredClone(grant)] }); api.read.mockResolvedValue({ data: structuredClone(record) }); api.append.mockResolvedValue({ data: { _id: "new-note" }, meta: {} });
    vi.stubGlobal("fetch", vi.fn(() => { throw Error("No provider or external request allowed"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function openRecord() { fireEvent.click(await screen.findByRole("button", { name: t.openRecord })); await screen.findByText("Original consultation note"); }
describe("receiving physician care access", () => {
    it("reads only after an explicit record selection and keeps authors, professions and original notes separate", async () => {
        render(<View />); await screen.findByRole("button", { name: t.openRecord });
        expect(api.read).not.toHaveBeenCalled(); expect(api.append).not.toHaveBeenCalled();
        await openRecord();
        expect(api.read).toHaveBeenCalledWith("synthetic-grant");
        expect(screen.getByText("Original consultation note")).toHaveAttribute("translate", "no");
        expect(screen.getByText("Earlier appended fictional note")).toHaveAttribute("translate", "no");
        expect(screen.getByText(/SyntheticEmergencyPhysician/)).toHaveTextContent("Emergency Physician");
        expect(screen.getByText(/SyntheticIPS/)).toHaveTextContent(t.professionUnknown);
        expect(screen.getByRole("textbox", { name: t.noteLabel })).toHaveValue("");
        expect(screen.getByText(t.rights)).toBeVisible();
        expect(fetch).not.toHaveBeenCalled();
    });
    it("appends only the new authored text after a separate explicit confirmation and retains original notes", async () => {
        const before=structuredClone(record); render(<View />); await openRecord();
        const input=screen.getByRole("textbox", { name: t.noteLabel });
        fireEvent.change(input, { target: { value: "New fictional consultation note" } });
        expect(api.append).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: t.appendNote })).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox", { name: t.noteConsent }));
        fireEvent.click(screen.getByRole("button", { name: t.appendNote }));
        await screen.findByText(t.noteSaved);
        expect(api.append).toHaveBeenCalledTimes(1);
        expect(api.append).toHaveBeenCalledWith("synthetic-grant", "New fictional consultation note");
        await screen.findByText("Original consultation note");
        expect(record).toEqual(before); expect(fetch).not.toHaveBeenCalled();
    });
    it("does not switch records or discard a draft without an explicit draft action", async () => {
        render(<View />); await openRecord();
        fireEvent.change(screen.getByRole("textbox", { name: t.noteLabel }), { target: { value: "Unsubmitted fictional draft" } });
        expect(screen.getByRole("button", { name: t.openRecord })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: t.discardDraft }));
        expect(screen.getByRole("textbox", { name: t.noteLabel })).toHaveValue("");
        expect(screen.getByRole("button", { name: t.openRecord })).toBeEnabled(); expect(api.append).not.toHaveBeenCalled();
    });
    it("hides clinical data and refuses further note entry after server revocation", async () => {
        api.append.mockResolvedValue({ error: { code: "FORBIDDEN", message: "Private diagnostic" } });
        render(<View />); await openRecord();
        fireEvent.change(screen.getByRole("textbox", { name: t.noteLabel }), { target: { value: "New fictional draft" } });
        fireEvent.click(screen.getByRole("checkbox", { name: t.noteConsent })); fireEvent.click(screen.getByRole("button", { name: t.appendNote }));
        expect(await screen.findByRole("alert")).toHaveTextContent(t.unavailable);
        expect(screen.queryByText("Original consultation note")).not.toBeInTheDocument();
        expect(screen.queryByRole("textbox", { name: t.noteLabel })).not.toBeInTheDocument();
        expect(screen.queryByText("Private diagnostic")).not.toBeInTheDocument();
    });
    it("does not retry an uncertain write and requires a successful refresh before another confirmation", async () => {
        api.append.mockResolvedValue({ error: { code: "INTERNAL_ERROR", message: "Private diagnostic" } });
        render(<View />); await openRecord();
        fireEvent.change(screen.getByRole("textbox", { name: t.noteLabel }), { target: { value: "Uncertain fictional draft" } });
        fireEvent.click(screen.getByRole("checkbox", { name: t.noteConsent })); fireEvent.click(screen.getByRole("button", { name: t.appendNote }));
        await screen.findByRole("alert");
        expect(api.append).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: t.appendNote })).toBeDisabled();
        expect(screen.getByRole("checkbox", { name: t.noteConsent })).toBeDisabled();
        const refresh=screen.getAllByRole("button", { name: t.refresh }).find(button=>!button.hasAttribute("disabled"))!;
        fireEvent.click(refresh); await screen.findByText("Original consultation note");
        expect(screen.getByRole("checkbox", { name: t.noteConsent })).not.toBeChecked(); expect(api.append).toHaveBeenCalledTimes(1);
    });
    it("removes the private record from the view when the grant expires", async () => {
        vi.useFakeTimers(); render(<View />); await act(async()=>{});
        fireEvent.click(screen.getByRole("button", { name: t.openRecord })); await act(async()=>{});
        expect(screen.getByText("Original consultation note")).toBeInTheDocument();
        await act(async()=>{ await vi.advanceTimersByTimeAsync(3600001); });
        expect(screen.queryByText("Original consultation note")).not.toBeInTheDocument();
        expect(screen.queryByRole("textbox", { name: t.noteLabel })).not.toBeInTheDocument(); expect(screen.getByRole("alert")).toHaveTextContent(t.unavailable);
    });
    it.each(["RECEPTION", "ADMIN", "SUPERADMIN"])("does not load care access for %s", role => {
        auth.user.role=role;render(<View />);expect(screen.getByRole("alert")).toHaveTextContent(t.unavailable);expect(api.inbox).not.toHaveBeenCalled();expect(api.read).not.toHaveBeenCalled();
    });
    it("routes IPS owners to their own patient management without reading a physician inbox", () => {
        auth.user={id:"ips-owner",role:"IPS"};render(<View />);expect(screen.getByRole("link",{name:t.ownPatients})).toHaveAttribute("href","/patients");expect(api.inbox).not.toHaveBeenCalled();
    });
    it("ignores a delayed write completion after the clinician session changes", async () => {
        let resolve!: (response: object) => void;
        api.append.mockImplementation(() => new Promise(done => { resolve=done; }));
        const view=render(<View />); await openRecord();
        fireEvent.change(screen.getByRole("textbox", { name: t.noteLabel }), { target: { value: "New fictional draft" } });
        fireEvent.click(screen.getByRole("checkbox", { name: t.noteConsent })); fireEvent.click(screen.getByRole("button", { name: t.appendNote }));
        auth.user={ id: "other-physician", role: "MEDECIN" }; view.rerender(<View />);
        await waitFor(() => expect(api.inbox).toHaveBeenCalledTimes(2));
        await act(async () => { resolve({ data: { _id: "old-session-note" } }); });
        expect(api.read).toHaveBeenCalledTimes(1); expect(screen.queryByText(t.noteSaved)).not.toBeInTheDocument();
        expect(screen.queryByText("Original consultation note")).not.toBeInTheDocument();
    });

    it("presents the shared profile as labelled clinical fields while retaining original note authors",async()=>{
        api.read.mockResolvedValue({data:{...structuredClone(record),profile:{objective:"Authored fictional objective",age:"72",sex:"",clinicalNotes:"Authored profile note — 原文",num_assurance_maladie:"SYNTHETIC-RAMQ-EXCLUDED"}}});
        const {container}=render(<View/>);await openRecord();
        expect(screen.getByText(t.profileObjective)).toBeVisible();expect(screen.getByText("Authored fictional objective").closest("dd")).toHaveAttribute("translate","no");expect(screen.getByText(t.profileNotes)).toBeVisible();expect(screen.getByText("Authored profile note — 原文")).toBeVisible();
        expect(screen.getByText(/SyntheticIPS/)).toHaveTextContent(t.professionUnknown);expect(screen.getByText(/SyntheticEmergencyPhysician/)).toHaveTextContent("Emergency Physician");
        expect(container.querySelector("pre")).toBeNull();expect(screen.queryByText("clinicalNotes")).not.toBeInTheDocument();expect(screen.queryByText("SYNTHETIC-RAMQ-EXCLUDED")).not.toBeInTheDocument();expect(api.append).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
    });

});
