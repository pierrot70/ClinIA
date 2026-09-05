import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { CONSULTATION_LABELS, consultationLabels } from "../i18n/consultationLabels";
import { ConsultationsPage } from "./ConsultationsPage";

const api = vi.hoisted(() => vi.fn());
vi.mock("../services/consultationApi", () => ({ consultationRequest: api }));
const detail = {
    patient: { _id: "patient", prenom: "Test", nom: "Patient" },
    appointment: { _id: "appointment", date: "2030-01-01", time: "11:30", status: "scheduled" },
    notes: [{ _id: "note", note: "Previous doctor's clinical note.", authorUserId: "leroux", author: "Dr-Leroux", createdAt: "2030-01-01" }],
    legacyNote: "Previous clinical history.", fullHistory: true, canAddNote: true, canAcceptCare: true, inCare: false,
};
function Page({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <ConsultationsPage />
    </HomeI18nContext.Provider>;
}
beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async path => !path ? [detail.appointment] : detail);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("consultation UI", () => {
    it.each(Object.keys(CONSULTATION_LABELS))("changes labels to %s without translating clinical contents", async locale => {
        const { rerender } = render(<Page locale="fr-CA" />);
        fireEvent.click(await screen.findByRole("button", { name: consultationLabels("fr-CA").open }));
        await screen.findByText("Previous doctor's clinical note.");
        rerender(<Page locale={locale} />);
        const t = consultationLabels(locale);
        expect(Object.keys(t).sort()).toEqual(Object.keys(CONSULTATION_LABELS["fr-CA"]).sort());
        expect(Object.values(t).every(value => value.trim())).toBe(true);
        expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: t.accept })).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: t.add })).toHaveAttribute("lang", "en");
        expect(screen.getByText("Previous doctor's clinical note.")).toHaveAttribute("translate", "no");
        expect(screen.getByText("Previous clinical history.")).toHaveAttribute("dir", "ltr");
        expect(api).toHaveBeenCalledTimes(2);
    });
    it("adds a separate note without accepting permanent care", async () => {
        const t = consultationLabels("en-CA");
        render(<Page locale="en-CA" />);
        fireEvent.click(await screen.findByRole("button", { name: t.open }));
        fireEvent.change(await screen.findByRole("textbox"), { target: { value: "My new note." } });
        fireEvent.click(screen.getByRole("button", { name: t.save }));
        await screen.findByText(t.saved);
        expect(api).toHaveBeenCalledWith("/appointment/notes", { note: "My new note." });
        expect(api.mock.calls.some(([path]) => path?.includes("accept-care"))).toBe(false);
        expect(screen.queryByRole("button", { name: /edit|delete/i })).not.toBeInTheDocument();
    });
    it("requires explicit confirmation before accepting care", async () => {
        const t = consultationLabels("en-CA");
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        render(<Page locale="en-CA" />);
        fireEvent.click(await screen.findByRole("button", { name: t.open }));
        fireEvent.click(await screen.findByRole("button", { name: t.accept }));
        expect(confirm).toHaveBeenCalledWith(t.confirm);
        expect(api).toHaveBeenCalledTimes(2);
        confirm.mockReturnValue(true);
        fireEvent.click(screen.getByRole("button", { name: t.accept }));
        await waitFor(() => expect(api).toHaveBeenCalledWith("/appointment/accept-care", {}));
        await screen.findByText(t.saved);
    });
    it("removes clinical content when a refresh loses authorization", async () => {
        const t = consultationLabels("en-CA");
        render(<Page locale="en-CA" />);
        fireEvent.click(await screen.findByRole("button", { name: t.open }));
        await screen.findByText("Previous doctor's clinical note.");
        api.mockRejectedValue(new Error("FORBIDDEN"));
        fireEvent.click(screen.getByRole("button", { name: t.refresh }));
        await screen.findByRole("alert");
        expect(screen.queryByText("Previous doctor's clinical note.")).not.toBeInTheDocument();
    });
});
