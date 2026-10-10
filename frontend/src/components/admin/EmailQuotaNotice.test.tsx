import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "../../auth/roles";
import { useAuth } from "../../hooks/useAuth";
import { labels } from "../../i18n/uiLabels";
import { SessionExpiredError } from "../../services/authService";
import { EmailQuotaNotice } from "./EmailQuotaNotice";

vi.mock("../../hooks/useAuth", () => ({ useAuth: vi.fn() }));
const authFetch = vi.fn();
const t = labels.emailQuota;
function setRole(role: UserRole = "ADMIN", isAuthenticated = true) {
    vi.mocked(useAuth).mockReturnValue({
        isAuthenticated, user: { id: "synthetic-admin", role }, authFetch,
    } as unknown as ReturnType<typeof useAuth>);
}
function respond(count = 20, status = "ok") {
    authFetch.mockResolvedValue({ ok: true, json: async () => ({ data: {
        day: "2026-10-10", limit: 150, warningThreshold: 120,
        count: status === "unavailable" ? null : count,
        remaining: status === "unavailable" ? null : Math.max(0, 150 - count), status,
    } }) });
}

beforeEach(() => { authFetch.mockReset(); setRole(); respond(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("EmailQuotaNotice", () => {
    it.each(["ADMIN", "SUPERADMIN"] as UserRole[])("shows a daily counter for %s", async role => {
        setRole(role);
        render(<EmailQuotaNotice />);
        expect(screen.getByText(t.loading)).toBeInTheDocument();
        expect(screen.queryByText(t.normal)).not.toBeInTheDocument();
        expect(await screen.findByText("20 / 150 tentatives courriel")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent(t.normal);
        expect(screen.getByText("Jour UTC : 2026-10-10")).toBeVisible();
        expect(screen.getByText("130 tentatives restantes")).toBeVisible();
        expect(authFetch).toHaveBeenCalledWith("/api/db-status/email-quota", { signal: expect.any(AbortSignal) });
    });
    it.each(["USER", "MEDECIN", "RECEPTION"] as UserRole[])("does not fetch or render for %s", role => {
        setRole(role);
        const { container } = render(<EmailQuotaNotice />);
        expect(container).toBeEmptyDOMElement();
        expect(authFetch).not.toHaveBeenCalled();
    });
    it("does not expose quota to an unauthenticated admin", () => {
        setRole("ADMIN", false);
        const { container } = render(<EmailQuotaNotice />);
        expect(container).toBeEmptyDOMElement();
        expect(authFetch).not.toHaveBeenCalled();
    });
    it.each([[120, "warning", t.warning], [150, "exhausted", t.exhausted], [0, "unavailable", t.unavailable]])(
        "announces %s / %s", async (count, status, message) => {
            respond(Number(count), String(status));
            render(<EmailQuotaNotice />);
            expect(await screen.findByRole("alert")).toHaveTextContent(message);
            if (status === "unavailable") {
                expect(screen.queryByText(/\d+ \/ 150/)).not.toBeInTheDocument();
                expect(screen.queryByText(/tentatives restantes/)).not.toBeInTheDocument();
                expect(screen.queryByText(/Jour UTC/)).not.toBeInTheDocument();
            }
        });
    it.each(["transport", "route", "malformed", "missing", "contradictory", "session"])(
        "reports unavailable for %s failure", async failure => {
            if (failure === "transport") authFetch.mockRejectedValue(new Error("Offline"));
            if (failure === "session") authFetch.mockRejectedValue(new SessionExpiredError());
            if (failure === "route") authFetch.mockResolvedValue({ ok: false, status: 404 });
            if (failure === "malformed") authFetch.mockResolvedValue({ ok: true, json: async () => { throw new Error("JSON"); } });
            if (failure === "missing") authFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { status: "ok" } }) });
            if (failure === "contradictory") respond(150, "ok");
            render(<EmailQuotaNotice />);
            expect(await screen.findByRole("alert")).toHaveTextContent(t.unavailable);
            expect(screen.queryByText(t.normal)).not.toBeInTheDocument();
            expect(screen.queryByText(/\d+ \/ 150/)).not.toBeInTheDocument();
        });
    it("refreshes every minute, clears stale count on failure and recovers", async () => {
        vi.useFakeTimers();
        const { unmount } = render(<EmailQuotaNotice />);
        await act(async () => {});
        expect(screen.getByText("20 / 150 tentatives courriel")).toBeInTheDocument();
        await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
        expect(authFetch).toHaveBeenCalledTimes(1);
        respond(120, "warning");
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(screen.getByRole("alert")).toHaveTextContent("120 / 150");
        authFetch.mockRejectedValue(new Error("Offline"));
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        expect(screen.getByRole("alert")).toHaveTextContent(t.unavailable);
        expect(screen.queryByText(/120 \/ 150/)).not.toBeInTheDocument();
        respond(1, "ok");
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        expect(screen.getByRole("status")).toHaveTextContent("1 / 150");
        const signal = authFetch.mock.calls[0][1].signal as AbortSignal;
        unmount();
        expect(signal.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(authFetch).toHaveBeenCalledTimes(4);
    });
    it("stops fetching on session expiry and relies on authFetch session handling", async () => {
        vi.useFakeTimers();
        authFetch.mockRejectedValue(new SessionExpiredError());
        render(<EmailQuotaNotice />);
        await act(async () => {});
        await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
        expect(authFetch).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("alert")).toHaveTextContent(t.unavailable);
    });
    it("clears the notice and timer when admin access is lost", async () => {
        vi.useFakeTimers();
        const { container, rerender } = render(<EmailQuotaNotice />);
        await act(async () => {});
        setRole("MEDECIN");
        rerender(<EmailQuotaNotice />);
        expect(container).toBeEmptyDOMElement();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(authFetch).toHaveBeenCalledTimes(1);
    });
    it("does not publish a response after unmount", async () => {
        let finish!: (value: unknown) => void;
        authFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const { unmount } = render(<EmailQuotaNotice />);
        unmount();
        await act(async () => { finish({ ok: true, json: async () => ({ data: null }) }); });
        expect(screen.queryByText(t.title)).not.toBeInTheDocument();
    });
});
