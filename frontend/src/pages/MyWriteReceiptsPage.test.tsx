import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyWriteReceiptsPage } from "./MyWriteReceiptsPage";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { getMyWriteReceiptsLabels, getReceiptLabelFallback, receiptLabelRows } from "../i18n/myWriteReceiptsLabels";

const mocks = vi.hoisted(() => ({ locale: "fr-CA", fetch: vi.fn(), patients: vi.fn() }));
vi.mock("../contexts/HomeI18nContext", () => ({ useHomeI18n: () => ({ locale: mocks.locale }) }));
vi.mock("../services/writeOperationAuditsApi", () => ({ fetchMyWriteReceipts: mocks.fetch }));
vi.mock("../services/patientsApi", () => ({ fetchPatientsPaginated: mocks.patients }));

const receipt = {
    timestamp: "2026-09-01T12:00:00Z", verificationId: "TEST-RECEIPT-123", patientId: null,
    collectionName: "cliniciancomments", operation: "REPLY", changedFields: ["replies"], resourceId: "test-resource",
    writeConcern: { w: "majority", j: true },
    replicaSet: { status: "OK", healthyCount: 3, memberCount: 3, majorityAvailable: true, maxLagSeconds: 0 },
};
const response = (logs: unknown[] = []) => ({ data: { logs, pagination: { page: 1, total: logs.length, totalPages: 1 } } });
const results = getMyWriteReceiptsLabels("en-CA");
function leaves(value: object): string[] {
    return Object.values(value).flatMap(child => typeof child === "string" ? [child] : leaves(child));
}

describe("my write receipts localization", () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.locale = "fr-CA"; mocks.fetch.mockResolvedValue(response()); });
    afterEach(cleanup);

    it("covers every French source, without duplicate dictionary rows", () => {
        const sources = receiptLabelRows.map(row => row[0]);
        expect(new Set(sources).size).toBe(sources.length);
        leaves(UI_LABELS_FR.myWriteReceipts).forEach(source => expect(sources).toContain(source));
        receiptLabelRows.forEach(row => {
            expect(row).toHaveLength(9);
            row.forEach(text => expect(text.trim().length).toBeGreaterThan(0));
        });
    });

    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])(
        "switches filters to %s but keeps receipt results in English without changing API values", async locale => {
            const { rerender } = render(<MyWriteReceiptsPage />);
            await waitFor(() => expect(screen.getAllByText(results.status.empty)).toHaveLength(2));
            mocks.locale = locale;
            rerender(<MyWriteReceiptsPage />);
            const ui = getMyWriteReceiptsLabels(locale);
            expect(screen.getByRole("heading", { name: ui.title })).toBeInTheDocument();
            expect(screen.getByText(ui.description)).toBeInTheDocument();
            expect(screen.getByPlaceholderText(ui.placeholders.patientSearch)).toBeInTheDocument();
            expect(screen.getAllByText(results.status.empty)).toHaveLength(2);
            expect(screen.getAllByRole("button", { name: results.actions.previous })).toHaveLength(2);
            expect(getReceiptLabelFallback(UI_LABELS_FR.header.nav.myWriteReceipts, locale)).toBeTruthy();
            expect(mocks.fetch).toHaveBeenCalledTimes(1);
            mocks.fetch.mockResolvedValue(response([receipt]));
            fireEvent.change(screen.getByLabelText(ui.filters.operation), { target: { value: "REPLY" } });
            fireEvent.change(screen.getByLabelText(ui.filters.collection), { target: { value: "cliniciancomments" } });
            fireEvent.click(screen.getAllByRole("button", { name: ui.actions.search })[0]);
            await waitFor(() => expect(screen.getAllByRole("button", { name: results.actions.showDetails })).toHaveLength(2));
            expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ operation: "REPLY", collectionName: "cliniciancomments" }));
            expect(screen.getByRole("option", { name: ui.operations.REPLY })).toBeInTheDocument();
            expect(screen.getAllByText(results.operations.REPLY).length).toBeGreaterThan(1);
            fireEvent.click(screen.getAllByRole("button", { name: results.actions.showDetails })[1]);
            expect(screen.getByRole("region", { name: results.details.title })).toBeInTheDocument();
            expect(screen.getByText(results.details.confirmed)).toBeInTheDocument();
            expect(screen.getAllByText("TEST-RECEIPT-123").length).toBeGreaterThan(0);
            expect(screen.getAllByText(new Date(receipt.timestamp).toLocaleString("en-CA")).length).toBeGreaterThan(0);
            const before = screen.getByRole("table").outerHTML;
            mocks.locale = locale === "fr-CA" ? "he" : "fr-CA";
            rerender(<MyWriteReceiptsPage />);
            expect(screen.getByRole("table").outerHTML).toBe(before);
            expect(screen.getByRole("table").closest("section")).toHaveAttribute("lang", "en-CA");
            expect(screen.getByRole("table").closest("section")).toHaveAttribute("dir", "ltr");
        }
    );

    it("keeps result errors in English when the language changes", async () => {
        mocks.fetch.mockResolvedValue({ error: { message: "Erreur serveur" } });
        const { rerender } = render(<MyWriteReceiptsPage />);
        await waitFor(() => expect(screen.getAllByText(results.status.loadError)).toHaveLength(2));
        mocks.locale = "ja";
        rerender(<MyWriteReceiptsPage />);
        expect(screen.getAllByText(results.status.loadError)).toHaveLength(2);
        expect(screen.queryByText("Erreur serveur")).not.toBeInTheDocument();
    });
});
