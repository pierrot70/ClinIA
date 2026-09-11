import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../../i18n/homeStrings";
import { validationReportLabels } from "../../i18n/validationReportLabels";
import { ValidationReportsMenu } from "./ValidationReportsMenu";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function Menu({ locale = "fr", mobile = false, onNavigate = () => {} }) {
    return <MemoryRouter initialEntries={["/admin/validation-reports/concurrency/walk-in"]}>
        <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
            <ValidationReportsMenu mobile={mobile} onNavigate={onNavigate} />
        </HomeI18nContext.Provider>
    </MemoryRouter>;
}
describe("validation reports submenu", () => {
    it.each([false, true])("hides the menu on remote production (mobile=%s)", mobile => {
        vi.stubEnv("PROD", true);
        vi.stubGlobal("location", { hostname: "clinia.example.com" });
        const { container } = render(<Menu mobile={mobile} />);
        expect(container.querySelector("details")).toBeNull();
        expect(screen.queryByText("Rapports de validation")).not.toBeInTheDocument();
    });
    it.each(["localhost", "127.0.0.1", "[::1]"])("keeps reports in local builds on %s", hostname => {
        vi.stubEnv("PROD", true);
        vi.stubGlobal("location", { hostname });
        render(<Menu />);
        expect(screen.getByText("Rapports de validation")).toBeVisible();
    });
    it("keeps the menu in staging development mode", () => {
        vi.stubEnv("PROD", false);
        vi.stubGlobal("location", { hostname: "staging.internal" });
        render(<Menu />);
        expect(screen.getByText("Rapports de validation")).toBeVisible();
    });
    it.each(["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"])("updates category and menu labels in %s", locale => {
        const { container, rerender } = render(<Menu />);
        fireEvent.click(container.querySelector("summary")!);
        fireEvent.click(container.querySelectorAll("summary")[1]);
        rerender(<Menu locale={locale} />);
        const t = validationReportLabels(locale);
        expect(container.querySelector("summary")).toHaveTextContent(t.title);
        expect(container.querySelectorAll("summary")[1]).toHaveTextContent(t.concurrency);
        const link = screen.getByRole("link", { name: t.walkInBooking });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute("href", "/admin/validation-reports/concurrency/walk-in");
        expect(link).toHaveAttribute("aria-current", "page");
    });
    it.each([false, true])("opens the submenu and closes it on navigation (mobile=%s)", mobile => {
        const onNavigate = vi.fn();
        const { container } = render(<Menu mobile={mobile} onNavigate={onNavigate} />);
        const details = container.querySelector("details")!;
        expect(details).not.toHaveAttribute("open");
        fireEvent.click(container.querySelector("summary")!);
        expect(details).toHaveAttribute("open");
        const nested = container.querySelectorAll("details")[1];
        const link = screen.getByRole("link", { name: "Prise de rendez-vous Walk-In" });
        expect(nested).not.toHaveAttribute("open");
        expect(link).not.toBeVisible();
        fireEvent.click(container.querySelectorAll("summary")[1]);
        expect(link).toBeVisible();
        fireEvent.click(link);
        expect(nested).not.toHaveAttribute("open");
        expect(details).not.toHaveAttribute("open"); expect(onNavigate).toHaveBeenCalledTimes(1);
    });
});
