import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { localizeUiLabel } from "../i18n/localUiTranslations";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { WriteOperationAuditsPage } from "./WriteOperationAuditsPage";

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../services/writeOperationAuditsApi", () => ({ fetchWriteOperationAudits: api.list }));
function Page({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><WriteOperationAuditsPage /></HomeI18nContext.Provider>;
}
afterEach(cleanup);
describe("write audit catalog binding", () => {
    it.each(["en-CA", "es", "ko-KR", "vi", "no-NO", "ja", "zh", "he"])("changes title and loaded summary synchronously in %s", async locale => {
        api.list.mockResolvedValue({ data: { logs: [], summary: { total: 12345, byOperation: {}, byReplicaStatus: {}, majorityUnavailableCount: 0 }, pagination: { page: 1, totalPages: 1, total: 0 } } });
        const { rerender, container } = render(<Page locale="fr-CA" />);
        const source = UI_LABELS_FR.writeOperationAudits;
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(source.title);
        await waitFor(() => expect(container.textContent).toContain(new Intl.NumberFormat("fr-CA").format(12345)));
        rerender(<Page locale={locale} />);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(localizeUiLabel(source.title, locale));
        expect(screen.getByText(localizeUiLabel(source.summary.majorityUnavailable, locale))).toBeInTheDocument();
        expect(container.textContent).toContain(new Intl.NumberFormat(locale).format(12345));
    });
});
