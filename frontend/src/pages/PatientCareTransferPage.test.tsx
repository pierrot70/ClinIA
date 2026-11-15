import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { PatientCareTransferPage } from "./PatientCareTransferPage";

const api = vi.hoisted(() => ({
    user: { id: "synthetic-ips", role: "IPS" },
    getCareTransferContext: vi.fn(), listCareTransfers: vi.fn(), requestCareTransfer: vi.fn(),
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
    api.listCareTransfers.mockResolvedValue({ data: [] });
    api.getCareTransferContext.mockResolvedValue({ data: { patient, clinicians: [clinician] } });
});
afterEach(cleanup);

describe("patient care transfer", () => {
    it("requires the IPS to record consent for the selected doctor before sending", async () => {
        const pending = transfer();
        api.requestCareTransfer.mockResolvedValue({ data: pending });
        renderPage({ patientId: patient._id });
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

    it("shows a read-only preview and links to normal patient management after acceptance", async () => {
        api.user = { id: clinician._id, role: "MEDECIN" };
        const pending = transfer();
        api.listCareTransfers.mockResolvedValue({ data: [pending] });
        api.readCareTransferRecord.mockResolvedValue({ data: {
            transfer: pending, patient, profile: {}, originalNotes: [], sharedNotes: [], notesTruncated: false,
        } });
        api.decideCareTransfer.mockResolvedValue({ data: { ...pending, status: "ACCEPTED" } });
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: text.open }));
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
