import React from "react";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { validationReportLabels } from "../i18n/validationReportLabels";
import { ValidationReportsPage } from "./ValidationReportsPage";
const api = vi.hoisted(() => ({ list: vi.fn(), download: vi.fn() }));
vi.mock("../services/validationReportsApi", () => ({ fetchValidationReports: api.list, downloadValidationReport: api.download }));
const report = { runId: "run", commit: "a".repeat(40), dirty: false, correspondence: "match", passed: false, cleanup: true,
    finishedAt: "2026-09-11T10:00:00Z", points: [{ point: 1, passed: 1, expected: 1 }] };
function Page({ locale = "fr" }) { return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><ValidationReportsPage /></HomeI18nContext.Provider>; }
beforeEach(() => { vi.resetAllMocks(); api.list.mockResolvedValue({ deployment: { commit: report.commit }, reports: [report], rejected: 0 }); api.download.mockResolvedValue(undefined); });
afterEach(cleanup);
describe("validation reports page", () => {
    it.each([
        ["2026-09-11T10:00:00Z", "06:00:00"],
        ["2026-01-11T10:00:00Z", "05:00:00"],
    ])("shows Toronto time including seasonal offset for %s", async (finishedAt, localTime) => {
        api.list.mockResolvedValue({ deployment: { commit: report.commit }, rejected: 0, reports: [{ ...report, finishedAt }] });
        const { container } = render(<Page locale="en-CA" />);
        await screen.findByText(validationReportLabels("en").match);
        const time = container.querySelector("summary time");
        expect(time).toHaveAttribute("datetime", finishedAt);
        expect(time).toHaveTextContent(localTime);
        expect(time).toBeVisible();
        expect(container.querySelector("details")).not.toHaveAttribute("open");
    });
    it("groups by full commit, starts collapsed and preserves every run and its downloads", async () => {
        const otherCommit = `${report.commit.slice(0, 39)}b`;
        api.list.mockResolvedValue({ deployment: { commit: report.commit }, rejected: 0, reports: [
            { ...report, runId: "old-failed", finishedAt: "2026-09-10T10:00:00Z", dirty: true },
            { ...report, runId: "other", commit: otherCommit },
            { ...report, runId: "new-passed", finishedAt: "2026-09-12T10:00:00Z", passed: true },
        ] });
        const { container } = render(<Page />);
        await screen.findAllByText(report.commit);
        const groups = container.querySelectorAll("details");
        expect(groups).toHaveLength(2);
        for (const group of groups) expect(group).not.toHaveAttribute("open");
        for (const button of screen.getAllByRole("button", { name: UI_LABELS_FR.validationReports.pdf })) expect(button).not.toBeVisible();
        const first = groups[0];
        expect(first.querySelector("summary")).toHaveTextContent(report.commit);
        expect(first.querySelector("summary")).toHaveTextContent("Exécutions: 2");
        expect(first.querySelector("summary time")).toHaveAttribute("datetime", "2026-09-12T10:00:00Z");
        expect(first.querySelector("summary time")).toHaveTextContent("06");
        expect(first.querySelector("summary")).toHaveTextContent(`${UI_LABELS_FR.validationReports.failed}: 1`);
        fireEvent.click(first.querySelector("summary")!);
        expect(first).toHaveAttribute("open");
        const runs = within(first as HTMLElement).getAllByRole("article");
        expect(runs).toHaveLength(2);
        expect(runs[0]).toHaveTextContent("new-passed");
        expect(runs[1]).toHaveTextContent("old-failed");
        expect(runs[1]).toHaveTextContent(UI_LABELS_FR.validationReports.dirty);
        fireEvent.click(within(runs[1]).getByRole("button", { name: UI_LABELS_FR.validationReports.bundle }));
        await waitFor(() => expect(api.download).toHaveBeenCalledWith("old-failed", "bundle"));
        fireEvent.click(first.querySelector("summary")!);
        expect(first).not.toHaveAttribute("open");
        expect(groups[1]).not.toHaveAttribute("open");
    });
    it.each(["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"])("uses versioned labels and updates the selector in %s", async locale => {
        const { rerender, container } = render(<Page />); await screen.findByText(UI_LABELS_FR.validationReports.match);
        fireEvent.click(container.querySelector("summary")!);
        rerender(<Page locale={locale} />); const t = validationReportLabels(locale);
        expect(Object.values(t)).toHaveLength(Object.keys(UI_LABELS_FR.validationReports).length);
        expect(Object.values(t).every(value => typeof value === "string" && value.length > 0)).toBe(true);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.walkInBooking);
        expect(container.querySelector("summary")).toHaveTextContent(`${t.runs}: 1`);
        expect(container.querySelector("summary")).toHaveTextContent(t.latestValidation);
        expect(container.querySelector("summary time")).toHaveAttribute("title", "America/Toronto");
        expect(screen.getByText(t.match)).toBeInTheDocument(); expect(screen.getByText(t.failed)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: t.pdf }));
        await waitFor(() => expect(api.download).toHaveBeenCalledWith("run", "pdf"));
    });
    it.each(["unknown", "dirty", "mismatch"])("does not claim a match for %s", async correspondence => {
        api.list.mockResolvedValue({ deployment: { commit: null }, reports: [{ ...report, correspondence }], rejected: 0 });
        render(<Page />); await screen.findByText(UI_LABELS_FR.validationReports.failed);
        expect(screen.queryByText(UI_LABELS_FR.validationReports.match)).not.toBeInTheDocument();
    });
    it("shows failures and the absence of published reports without inventing evidence", async () => {
        api.list.mockResolvedValue({ deployment: { commit: null }, reports: [], rejected: 1 });
        render(<Page />); await screen.findByText(UI_LABELS_FR.validationReports.empty);
        expect(screen.getByRole("alert")).toHaveTextContent(UI_LABELS_FR.validationReports.rejected);
    });
    it("does not display raw API errors", async () => {
        api.list.mockRejectedValue(new Error("secret")); render(<Page />);
        expect(await screen.findByRole("alert")).toHaveTextContent(UI_LABELS_FR.validationReports.error);
        expect(screen.queryByText("secret")).not.toBeInTheDocument();
    });
});
