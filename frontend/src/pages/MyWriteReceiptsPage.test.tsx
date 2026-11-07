import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyWriteReceiptsPage } from "./MyWriteReceiptsPage";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { getMyWriteReceiptsLabels, getReceiptLabelFallback, receiptLabelRows } from "../i18n/myWriteReceiptsLabels";

const mocks = vi.hoisted(() => ({ locale: "fr-CA", role: "MEDECIN", fetch: vi.fn(), patients: vi.fn() }));
vi.mock("../contexts/HomeI18nContext", () => ({ useHomeI18n: () => ({ locale: mocks.locale }) }));
vi.mock("../services/writeOperationAuditsApi", () => ({ fetchMyWriteReceipts: mocks.fetch }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
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
    beforeEach(() => { vi.clearAllMocks(); mocks.locale = "fr-CA"; mocks.role = "MEDECIN"; mocks.fetch.mockResolvedValue(response()); });
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


describe("reception personal receipts", () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.locale = "fr-CA"; mocks.role = "RECEPTION"; mocks.fetch.mockResolvedValue(response([receipt])); });
    afterEach(cleanup);

    it("shows the authorized name in the receipt table and mobile card without a patient lookup", async () => {
        mocks.fetch.mockResolvedValue(response([
            { ...receipt, collectionName: "appointments", patientId: "fictitious-id", patientName: "Camille Fictif" },
            { ...receipt, collectionName: "appointments", patientId: "fictitious-id", verificationId: "TEST-RECEIPT-456" },
        ]));
        render(<MyWriteReceiptsPage />);
        expect(await screen.findAllByText("Camille Fictif")).toHaveLength(2);
        expect(screen.getAllByText(results.unavailablePatient)).toHaveLength(2);
        expect(mocks.patients).not.toHaveBeenCalled();
    });

    it.each(["fr-CA", "en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])("shows own receipts without generic patient directory access in %s", async locale => {
        mocks.locale = locale;
        render(<MyWriteReceiptsPage />);
        const ui = getMyWriteReceiptsLabels(locale);
        await waitFor(() => expect(screen.getAllByRole("button", { name: results.actions.showDetails })).toHaveLength(2));
        expect(screen.getByRole("heading", { name: ui.title })).toBeInTheDocument();
        expect(screen.queryByPlaceholderText(ui.placeholders.patientSearch)).not.toBeInTheDocument();
        expect(mocks.patients).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText(ui.filters.collection), { target: { value: "appointments" } });
        fireEvent.click(screen.getAllByRole("button", { name: ui.actions.search })[0]);
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
        expect(mocks.fetch).toHaveBeenLastCalledWith(expect.objectContaining({ collectionName: "appointments", patientId: undefined }));
        expect(mocks.patients).not.toHaveBeenCalled();
    });
});


describe("receipt date defaults", () => {
    beforeEach(() => {
        vi.clearAllMocks(); mocks.locale = "fr-CA"; mocks.role = "RECEPTION";
        mocks.fetch.mockResolvedValue(response());
        vi.useFakeTimers({ toFake: ["Date"] });
    });
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it("uses the browser calendar independently of the selected UI language", async () => {
        const now = new Date("2026-10-31T23:30:00Z");
        vi.setSystemTime(now);
        const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const { rerender } = render(<MyWriteReceiptsPage />);
        const fr = getMyWriteReceiptsLabels("fr-CA");
        expect(screen.getByLabelText(fr.filters.startDate)).toHaveValue(day);
        expect(screen.getByLabelText(fr.filters.endDate)).toHaveValue(day);
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(expect.objectContaining({ startDate: day, endDate: day, startAt: expect.any(String), endBefore: expect.any(String) })));
        mocks.locale = "ja";
        rerender(<MyWriteReceiptsPage />);
        const ja = getMyWriteReceiptsLabels("ja");
        expect(screen.getByLabelText(ja.filters.startDate)).toHaveValue(day);
        expect(screen.getByLabelText(ja.filters.endDate)).toHaveValue(day);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    it("resets to today's dates and sends cleared filters, including after local midnight", async () => {
        vi.setSystemTime(new Date("2026-10-31T15:00:00Z"));
        render(<MyWriteReceiptsPage />);
        const ui = getMyWriteReceiptsLabels("fr-CA");
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
        fireEvent.change(screen.getByLabelText(ui.filters.startDate), { target: { value: "2025-01-01" } });
        fireEvent.change(screen.getByLabelText(ui.filters.endDate), { target: { value: "2025-02-01" } });
        fireEvent.change(screen.getByLabelText(ui.filters.collection), { target: { value: "appointments" } });
        fireEvent.change(screen.getByLabelText(ui.filters.operation), { target: { value: "CREATE" } });
        vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
        fireEvent.click(screen.getByRole("button", { name: ui.actions.reset }));
        const now = new Date();
        const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        expect(screen.getByLabelText(ui.filters.startDate)).toHaveValue(day);
        expect(screen.getByLabelText(ui.filters.endDate)).toHaveValue(day);
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
        expect(mocks.fetch).toHaveBeenLastCalledWith({ page: 1, limit: 25, patientId: undefined, operation: "", startDate: day, endDate: day, startAt: expect.any(String), endBefore: expect.any(String) });
        expect(screen.getByLabelText(ui.filters.collection)).toHaveValue("");
        expect(screen.getByLabelText(ui.filters.operation)).toHaveValue("");
        expect(mocks.patients).not.toHaveBeenCalled();
    });
});
