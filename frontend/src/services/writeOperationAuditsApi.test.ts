import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMyWriteReceipts } from "./writeOperationAuditsApi";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./authService", () => ({ authFetch: transport.fetch, SessionExpiredError: class extends Error {} }));
beforeEach(() => {
    vi.clearAllMocks();
    transport.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { logs: [], pagination: { page: 1, total: 0, totalPages: 1 } } }) });
});
describe("personal receipt local-date query transport", () => {
    it("sends date keys and explicit UTC bounds only to the existing personal endpoint", async () => {
        await fetchMyWriteReceipts({ startDate: "2026-03-29", endDate: "2026-03-29", startAt: "2026-03-28T23:00:00.000Z", endBefore: "2026-03-29T22:00:00.000Z", page: 1, limit: 25 });
        const url = new URL(transport.fetch.mock.calls[0][0], "https://clinia.test");
        expect(url.origin).toBe("https://clinia.test");
        expect(url.pathname).toBe("/api/write-operation-audits/my-receipts");
        expect(Object.fromEntries(url.searchParams)).toEqual({ page: "1", limit: "25", startDate: "2026-03-29", endDate: "2026-03-29", startAt: "2026-03-28T23:00:00.000Z", endBefore: "2026-03-29T22:00:00.000Z" });
    });
    it("does not add absent boundaries", async () => {
        await fetchMyWriteReceipts({ page: 1, limit: 25 });
        const url = new URL(transport.fetch.mock.calls[0][0], "https://clinia.test");
        expect(url.searchParams.has("startAt")).toBe(false);
        expect(url.searchParams.has("endBefore")).toBe(false);
    });
});
