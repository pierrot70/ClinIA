import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { UI_LOCALES } from "../i18n/uiLocales";
import { PatientsPage } from "./PatientsPage";

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), update: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({
    useAuth: () => ({ user: { id: "synthetic-admin", role: "ADMIN" }, isAuthenticated: true }),
}));
vi.mock("../services/patientsApi", async importOriginal => ({
    ...await importOriginal<typeof import("../services/patientsApi")>(),
    fetchPatientsPaginated: mocks.list,
    fetchPatientById: mocks.detail,
    updatePatient: mocks.update,
}));

const copy = UI_LABELS_FR.patientsPage;
const event = {
    reason: "<script>synthetic reason</script>",
    reactivatedAt: "2026-01-15T12:30:00.000Z",
    reactivatedByUserId: "synthetic-author",
    verificationId: "synthetic-receipt",
};
const patient = { _id: "synthetic-patient", nom: "Test", prenom: "Fictif", num_assurance_maladie: "" };
const success = (data: unknown) => ({ data, meta: { source: "real", model: "unknown" } });

function Page({ locale = "fr-CA" }: { locale?: string }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale } as React.ContextType<typeof HomeI18nContext>}>
        <PatientsPage />
    </HomeI18nContext.Provider></MemoryRouter>;
}

async function openPatient() {
    const buttons = await screen.findAllByRole("button", { name: copy.table.edit });
    fireEvent.click(buttons[buttons.length - 1]);
    return await screen.findByRole("region", { name: copy.reactivationHistory.title });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue(success({ data: [patient], meta: { total: 1, totalPages: 1 } }));
    mocks.detail.mockResolvedValue(success({ ...patient, reactivationHistory: [event] }));
    mocks.update.mockResolvedValue(success(patient));
    vi.stubGlobal("matchMedia", vi.fn(() => ({
        matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("patient reactivation history", () => {
    it("loads history only in the detail, renders the reason safely and reloads it after remount", async () => {
        const first = render(<Page />);
        await screen.findAllByRole("button", { name: copy.table.edit });
        expect(screen.queryByText(event.reason)).not.toBeInTheDocument();
        expect(mocks.detail).not.toHaveBeenCalled();
        const region = await openPatient();
        expect(within(region).getByText(event.reason)).toBeInTheDocument();
        expect(region.querySelector("script")).toBeNull();
        expect(within(region).getByText(event.reactivatedByUserId)).toBeInTheDocument();
        expect(within(region).getByText(event.verificationId)).toBeInTheDocument();
        expect(region.querySelector("time")).toHaveAttribute("datetime", event.reactivatedAt);
        expect(within(region).queryByRole("textbox")).not.toBeInTheDocument();
        first.unmount();
        render(<Page />);
        expect(within(await openPatient()).getByText(event.reason)).toBeInTheDocument();
        expect(mocks.detail).toHaveBeenCalledTimes(2);
    });

    it("clears history on cancel, creation and loading another patient without history", async () => {
        render(<Page />);
        await openPatient();
        fireEvent.click(screen.getByRole("button", { name: copy.form.cancel }));
        expect(screen.queryByRole("region", { name: copy.reactivationHistory.title })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: copy.tabs.search }));
        mocks.detail.mockResolvedValue(success({ ...patient, _id: "another-synthetic-patient" }));
        const region = await openPatient();
        expect(within(region).getByText(copy.reactivationHistory.empty)).toBeInTheDocument();
        expect(screen.queryByText(event.reason)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: copy.tabs.create }));
        expect(screen.queryByRole("region", { name: copy.reactivationHistory.title })).not.toBeInTheDocument();
    });

    it("preserves multiple entries, newest first, with an optional receipt", async () => {
        const later = { ...event, reason: "Later synthetic reason", reactivatedAt: "2026-02-01T12:00:00.000Z", verificationId: null };
        mocks.detail.mockResolvedValue(success({ ...patient, reactivationHistory: [event, later] }));
        render(<Page />);
        const region = await openPatient();
        const entries = within(region).getAllByRole("listitem");
        expect(within(entries[0]).getByText(later.reason)).toBeInTheDocument();
        expect(within(entries[0]).queryByText(copy.reactivationHistory.verification)).not.toBeInTheDocument();
        expect(within(entries[1]).getByText(event.reason)).toBeInTheDocument();
    });

    it("does not include server history in the editable patient payload", async () => {
        render(<Page />);
        await openPatient();
        fireEvent.click(screen.getByRole("button", { name: copy.form.save }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
        const [id, payload] = mocks.update.mock.calls[0];
        expect(id).toBe(patient._id);
        expect(payload).not.toHaveProperty("reactivationHistory");
        expect(JSON.stringify(payload)).not.toContain(event.reason);
    });

    it.each(UI_LOCALES)("provides local translations for every history label in %s", locale => {
        for (const source of Object.values(copy.reactivationHistory)) {
            expect(getLocalUiTranslation(source, locale)).toBeTruthy();
        }
    });
});
