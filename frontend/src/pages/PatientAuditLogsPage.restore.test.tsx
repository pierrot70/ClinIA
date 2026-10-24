import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { PatientAuditLogsPage } from "./PatientAuditLogsPage";
import type { PatientAuditLog } from "../services/patientsApi";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../services/authService", () => ({ authFetch: transport.fetch }));
const makeLog = (action: PatientAuditLog["action"], actor: string): PatientAuditLog => ({
    id: actor, action, outcome: "SUCCESS", actorUserId: null,
    actorUsernameMasked: actor, actorRole: "MEDECIN", ip: null, patientId: null,
    changedFields: [], requestPath: null, context: null, timestamp: "2026-10-24T12:00:00Z",
});
const archive = makeLog("PATIENT_ARCHIVE", "synthetic-archive-actor");
const restore = makeLog("PATIENT_RESTORE", "synthetic-restore-actor");
let responseLogs: PatientAuditLog[];

function Page({ locale = "fr-CA" }: { locale?: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><PatientAuditLogsPage /></HomeI18nContext.Provider>;
}
function lastAuditQuery() {
    const calls = transport.fetch.mock.calls.filter(([url]) => String(url).includes("/audit-logs?"));
    return new URL(String(calls.at(-1)?.[0]), "http://localhost").searchParams;
}
beforeEach(() => {
    responseLogs = [archive, restore];
    transport.fetch.mockReset();
    transport.fetch.mockImplementation(async (url: string) => {
        const body = String(url).includes("/audit-logs?")
            ? { data: { logs: responseLogs, pagination: { page: 1, totalPages: 1, total: responseLogs.length, limit: 20 } } }
            : { data: { data: [], meta: { page: 1, totalPages: 1, total: 0, limit: 50 } } };
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
});
afterEach(cleanup);

describe("patient restore audit filter", () => {
    it("sends PATIENT_RESTORE through the real API client, renders the returned rows and clears the filter", async () => {
        const user = userEvent.setup();
        render(<Page />);
        await screen.findByText(archive.actorUsernameMasked);
        await screen.findByText(restore.actorUsernameMasked);
        const selector = screen.getByRole("combobox", { name: "Action" });
        responseLogs = [restore]; // Fixed server fixture; filtering is not reimplemented in this mock.
        await act(async () => { await user.selectOptions(selector, "PATIENT_RESTORE"); });
        await waitFor(() => expect(lastAuditQuery().get("action")).toBe("PATIENT_RESTORE"));
        expect(lastAuditQuery().get("page")).toBe("1");
        await waitFor(() => expect(screen.queryByText(archive.actorUsernameMasked)).not.toBeInTheDocument());
        expect(within(screen.getByText(restore.actorUsernameMasked).closest("tr")!).getByText("Réactivation")).toBeInTheDocument();
        responseLogs = [archive, restore];
        await act(async () => { await user.selectOptions(selector, ""); });
        await waitFor(() => expect(lastAuditQuery().has("action")).toBe(false));
        expect(await screen.findByText(archive.actorUsernameMasked)).toBeInTheDocument();
    });

    it.each([
        ["fr-CA", "Réactivation"], ["en-CA", "Reactivation"], ["es", "Reactivación"],
        ["ko-KR", "재활성화"], ["vi", "Kích hoạt lại"], ["no-NO", "Reaktivering"],
        ["ja", "再有効化"], ["zh", "重新启用"], ["he", "הפעלה מחדש"],
    ])("localizes the selector and audit row in %s", async (locale, label) => {
        render(<Page locale={locale} />);
        const option = screen.getByRole("option", { name: label });
        expect(option).toHaveValue("PATIENT_RESTORE");
        const actor = await screen.findByText(restore.actorUsernameMasked);
        expect(within(actor.closest("tr")!).getByText(label)).toBeInTheDocument();
    });
});
