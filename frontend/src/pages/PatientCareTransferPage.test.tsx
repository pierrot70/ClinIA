import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { PatientCareTransferPage } from "./PatientCareTransferPage";

const api = vi.hoisted(() => ({
    user: { id: "synthetic-ips", role: "IPS" },
    getCareTransferCapabilities: vi.fn(), setCareTransferPreference: vi.fn(), getCareTransferContext: vi.fn(), listCareTransfers: vi.fn(), requestCareTransfer: vi.fn(), requestGeneralCareTransfer: vi.fn(),
    readCareTransferRecord: vi.fn(), decideCareTransfer: vi.fn(), cancelCareTransfer: vi.fn(),
}));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: api.user }) }));
vi.mock("../services/clinicalCareAccessApi", () => api);

const text = UI_LABELS_FR.patientCareTransfer;
const patient = { _id: "synthetic-patient", nom: "Fictif", prenom: "Patient" };
const clinician = { _id: "synthetic-family", nom: "Famille", prenom: "Médecin", username: "synthetic-family" };
const transfer = () => ({
    _id: "synthetic-transfer", patientId: patient._id, patient, targetUserId: clinician._id, status: "PENDING",
    expiresAt: new Date(Date.now() + 60000).toISOString(), createdAt: new Date().toISOString(),
});

function renderPage(state?: { patientId: string }) {
    return render(<MemoryRouter initialEntries={[{ pathname: "/clinical-care-transfer", state }]}>
        <PatientCareTransferPage />
    </MemoryRouter>);
}

beforeEach(() => {
    vi.resetAllMocks();
    api.user = { id: "synthetic-ips", role: "IPS" };
    api.getCareTransferCapabilities.mockResolvedValue({ data: { canInitiate: false } });
    api.listCareTransfers.mockResolvedValue({ data: [] });
    api.getCareTransferContext.mockResolvedValue({ data: { patient, clinicians: [clinician] } });
});
afterEach(cleanup);

describe("patient care transfer", () => {
    it.each(["IPS", "urgentologist"])("requires consent and exposes outgoing actions for %s", async profession => {
        if (profession === "urgentologist") {
            api.user = { id: "synthetic-urgentologist", role: "MEDECIN" };
            api.getCareTransferCapabilities.mockResolvedValue({ data: { canInitiate: true } });
        }
        const pending = transfer();
        api.requestCareTransfer.mockResolvedValue({ data: pending });
        renderPage({ patientId: patient._id });
        expect(screen.queryByRole("heading", { name: text.incoming })).not.toBeInTheDocument();
        const select = await screen.findByRole("combobox", { name: text.choosePhysician });
        const submit = screen.getByRole("button", { name: text.send });
        fireEvent.change(select, { target: { value: clinician._id } });
        expect(submit).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
        expect(submit).toBeEnabled();
        api.listCareTransfers.mockResolvedValue({ data: [pending] });
        fireEvent.click(submit);
        await screen.findByText(text.sent);
        expect(api.requestCareTransfer).toHaveBeenCalledExactlyOnceWith(patient._id, clinician._id, true);
        expect(await screen.findByRole("button", { name: text.cancel })).toBeVisible();
    });

    it("lets a family physician opt in and out, showing the last confirmed preference after a failed save", async () => {
        api.user = { id: clinician._id, role: "MEDECIN" };
        api.getCareTransferCapabilities.mockResolvedValue({ data: { canInitiate: false, acceptsNewPatients: false } });
        api.setCareTransferPreference.mockResolvedValueOnce({ data: { acceptsNewPatients: true } })
            .mockResolvedValueOnce({ error: { code: "INTERNAL_ERROR" } })
            .mockResolvedValueOnce({ data: { acceptsNewPatients: false } });
        renderPage();
        const checkbox = await screen.findByRole("checkbox", { name: text.acceptsNewPatients });
        await waitFor(() => expect(checkbox).toBeEnabled());
        expect(checkbox).not.toBeChecked();
        fireEvent.click(checkbox);
        await waitFor(() => expect(checkbox).toBeChecked());
        fireEvent.click(checkbox);
        await screen.findByRole("alert");
        expect(checkbox).toBeChecked();
        fireEvent.click(checkbox);
        await waitFor(() => expect(checkbox).not.toBeChecked());
        expect(api.setCareTransferPreference.mock.calls).toEqual([[true], [false], [false]]);
    });

    it("does not offer a preference to another specialty", async () => {
        api.user = { id: "synthetic-specialist", role: "MEDECIN" };
        api.getCareTransferCapabilities.mockResolvedValue({ data: { canInitiate: false, acceptsNewPatients: null } });
        renderPage();
        await screen.findByText(text.empty);
        expect(screen.queryByRole("checkbox", { name: text.acceptsNewPatients })).not.toBeInTheDocument();
    });

    it("reloads available doctors and requires new consent after the selected doctor opts out", async () => {
        const other = { ...clinician, _id: "other-doctor", username: "other-doctor" };
        api.getCareTransferContext.mockResolvedValueOnce({ data: { patient, clinicians: [clinician, other] } })
            .mockResolvedValueOnce({ data: { patient, clinicians: [other] } })
            .mockResolvedValue({ data: { patient, clinicians: [] } });
        api.requestCareTransfer.mockResolvedValue({ error: { code: "TRANSFER_RECIPIENT_UNAVAILABLE" } });
        renderPage({ patientId: patient._id });
        const select = await screen.findByRole("combobox");
        fireEvent.change(select, { target: { value: clinician._id } });
        fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
        fireEvent.click(screen.getByRole("button", { name: text.send }));
        await screen.findByText(text.recipientUnavailable);
        await waitFor(() => expect(select).toBeEnabled());
        expect(select).toHaveValue("");
        expect(screen.queryByRole("option", { name: new RegExp(clinician.username) })).not.toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: text.consent })).not.toBeChecked();
        expect(screen.getByRole("button", { name: text.send })).toBeDisabled();
        fireEvent.change(select, { target: { value: other._id } });
        expect(screen.getByRole("button", { name: text.send })).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
        fireEvent.click(screen.getByRole("button", { name: text.send }));
        await screen.findByText(text.noPhysicians);
        expect(screen.queryByRole("button", { name: text.send })).not.toBeInTheDocument();
    });

    it("offers an anonymous general invitation only after separate consent when direct recipients run out", async () => {
        api.getCareTransferContext.mockResolvedValue({ data: { patient, clinicians: [] } });
        const general = { ...transfer(), kind: "GENERAL", expiresAt: null, targetUserId: null };
        api.requestGeneralCareTransfer.mockResolvedValue({ data: general });
        renderPage({ patientId: patient._id });
        const send = await screen.findByRole("button", { name: text.sendGeneral });
        expect(send).toBeDisabled();
        expect(screen.queryByText(text.terms)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("checkbox", { name: text.generalConsent }));
        api.listCareTransfers.mockResolvedValue({ data: [general] });
        fireEvent.click(send);
        await screen.findByText(text.sent);
        const withdraw = await screen.findByRole("button", { name: text.cancel });
        expect(api.requestGeneralCareTransfer).toHaveBeenCalledExactlyOnceWith(patient._id, true);
        expect(api.requestCareTransfer).not.toHaveBeenCalled();
        api.cancelCareTransfer.mockResolvedValue({ data: { ...general, status: "CANCELLED" } });
        api.listCareTransfers.mockResolvedValue({ data: [] });
        fireEvent.click(withdraw);
        await screen.findByText(text.cancelled);
        expect(api.cancelCareTransfer).toHaveBeenCalledExactlyOnceWith(general._id);
    });

    it("refreshes direct recipients and clears the general consent if a doctor becomes available", async () => {
        api.getCareTransferContext.mockResolvedValueOnce({ data: { patient, clinicians: [] } })
            .mockResolvedValue({ data: { patient, clinicians: [clinician] } });
        api.requestGeneralCareTransfer.mockResolvedValue({ error: { code: "TRANSFER_RECIPIENT_AVAILABLE" } });
        renderPage({ patientId: patient._id });
        fireEvent.click(await screen.findByRole("checkbox", { name: text.generalConsent }));
        fireEvent.click(screen.getByRole("button", { name: text.sendGeneral }));
        await screen.findByText(text.directAvailable);
        expect(await screen.findByRole("combobox")).toHaveValue("");
        expect(screen.getByRole("checkbox", { name: text.consent })).not.toBeChecked();
        expect(screen.queryByRole("button", { name: text.sendGeneral })).not.toBeInTheDocument();
    });

    it("shows a reminder on the sender's open page when the 48-hour deadline is reached", async () => {
        const general = { ...transfer(), kind: "GENERAL", expiresAt: null, targetUserId: null,
            reminderAt: new Date(Date.now() + 150).toISOString(), reminderDue: false };
        api.listCareTransfers.mockResolvedValueOnce({ data: [general] }).mockResolvedValue({ data: [{ ...general, reminderDue: true }] });
        renderPage();
        await screen.findByText(text.generalInvitation);
        expect(screen.queryByText(text.generalOverdue)).not.toBeInTheDocument();
        await screen.findByText(text.generalOverdue, {}, { timeout: 4000 });
        expect(screen.getByRole("button", { name: text.cancel })).toBeVisible();
    });

    it.each(["accept", "stale"])("keeps a general invitation anonymous until the family physician accepts (%s)", async outcome => {
        api.user = { id: clinician._id, role: "MEDECIN" };
        api.getCareTransferCapabilities.mockResolvedValue({ data: { canInitiate: false, acceptsNewPatients: false } });
        // The interface must mask unsolicited identifying fields as well as handle the normal anonymous DTO.
        const general = { ...transfer(), kind: "GENERAL", expiresAt: null, professional: "hidden-issuer" };
        api.listCareTransfers.mockResolvedValueOnce({ data: [general] }).mockResolvedValue({ data: [] });
        renderPage();
        const accept = await screen.findByRole("button", { name: text.acceptGeneral });
        expect(screen.getByText(text.generalTerms)).toBeVisible();
        expect(screen.queryByText("Patient Fictif")).not.toBeInTheDocument();
        expect(screen.queryByText("hidden-issuer")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: text.open })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: text.decline })).not.toBeInTheDocument();
        api.decideCareTransfer.mockResolvedValue(outcome === "accept"
            ? { data: { ...general, status: "ACCEPTED" } } : { error: { code: "FORBIDDEN" } });
        fireEvent.click(accept);
        await screen.findByText(outcome === "accept" ? text.accepted : text.generalUnavailable);
        expect(api.decideCareTransfer).toHaveBeenCalledExactlyOnceWith(general._id, "accept");
        await screen.findByText(text.empty);
        expect(api.readCareTransferRecord).not.toHaveBeenCalled();
    });

    it("shows a read-only preview and links to normal patient management after acceptance", async () => {
        api.user = { id: clinician._id, role: "MEDECIN" };
        const pending = transfer();
        api.listCareTransfers.mockResolvedValue({ data: [pending] });
        api.readCareTransferRecord.mockResolvedValue({ data: {
            transfer: pending, patient, profile: {}, originalNotes: [], sharedNotes: [], notesTruncated: false,
        } });
        api.decideCareTransfer.mockResolvedValue({ data: { ...pending, status: "ACCEPTED" } });
        renderPage({ patientId: patient._id });
        fireEvent.click(await screen.findByRole("button", { name: text.open }));
        expect(api.getCareTransferContext).not.toHaveBeenCalled();
        expect(screen.queryByRole("heading", { name: text.sendHeading })).not.toBeInTheDocument();
        await screen.findByText(text.review);
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: UI_LABELS_FR.clinicalCareAccess.ownPatients })).not.toBeInTheDocument();
        api.listCareTransfers.mockResolvedValue({ data: [{ ...pending, status: "ACCEPTED" }] });
        fireEvent.click(screen.getByRole("button", { name: text.accept }));
        expect(await screen.findByText(text.accepted)).toBeVisible();
        expect(api.decideCareTransfer).toHaveBeenCalledExactlyOnceWith(pending._id, "accept");
        expect(screen.getByRole("link", { name: UI_LABELS_FR.clinicalCareAccess.ownPatients })).toHaveAttribute("href", "/patients");
        await waitFor(() => expect(screen.getByRole("button", { name: text.openAccepted })).toBeVisible());
    });
});
