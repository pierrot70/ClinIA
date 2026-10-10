import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nProvider, useHomeI18n } from "./HomeI18nContext";
import { UI_LOCALES } from "../i18n/uiLocales";
import { translateHomeStrings } from "../services/i18nApi";

vi.mock("../services/i18nApi", () => ({ translateHomeStrings: vi.fn().mockRejectedValue(new Error("offline test")) }));

function Probe() {
    const { locale, setLocaleFromDropdown } = useHomeI18n();
    return <><output data-testid="locale">{locale}</output>{UI_LOCALES.map(target =>
        <button key={target} onClick={() => void setLocaleFromDropdown(target)}>{target}</button>)}</>;
}

describe("global UI locale", () => {
    beforeEach(() => { window.localStorage.clear(); vi.clearAllMocks(); });

    it.each(UI_LOCALES)("keeps %s selected after remount despite an English browser", async target => {
        const first = render(<HomeI18nProvider><Probe /></HomeI18nProvider>);
        fireEvent.click(screen.getByRole("button", { name: target }));
        expect(screen.getByTestId("locale")).toHaveTextContent(target);
        expect(document.documentElement.lang).toBe(target);
        expect(document.documentElement.dir).toBe(target === "he" ? "rtl" : "ltr");
        expect(translateHomeStrings).not.toHaveBeenCalled();
        expect(window.localStorage.getItem("clinia_ui_locale_v3")).toBe(target);
        first.unmount();
        render(<HomeI18nProvider><Probe /></HomeI18nProvider>);
        await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent(target));
        expect(document.documentElement.lang).toBe(target);
        expect(document.documentElement.dir).toBe(target === "he" ? "rtl" : "ltr");
    });
});
