import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR as labels } from "../i18n/uiLabels.fr";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import UserRegisterPage from "./UserRegisterPage";

const api = vi.hoisted(() => ({ authFetch: vi.fn(), reauth: vi.fn(), clinics: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ authFetch: api.authFetch, user: { role: "SUPERADMIN" } }) }));
vi.mock("../hooks/useSensitiveReauthDialog", () => ({ useSensitiveReauthDialog: () => ({ requestSensitiveReauth: api.reauth, sensitiveReauthModal: null }) }));
vi.mock("../services/cliniqueApi", () => ({ fetchCliniquesPaginated: api.clinics }));

function Page({ locale }: { locale: string }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR,
        isTranslating: false, setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}>
        <UserRegisterPage />
    </HomeI18nContext.Provider></MemoryRouter>;
}
const temporaryPassword = "SYNTHETIC-PASSWORD-123!";
function response(data: unknown, ok = true) { return { ok, json: async () => data }; }
beforeEach(() => {
    vi.clearAllMocks();
    api.reauth.mockResolvedValue(true);
    api.clinics.mockResolvedValue({ data: { data: [] } });
    api.authFetch.mockImplementation(async (url: string) => {
        if (url.includes("reset-password")) return response({ data: { temporaryPassword } });
        return response({ data: { users: [{ id: "synthetic-user", username: "Compte synthétique", email: "user@synthetic.test",
            role: "MEDECIN", isActive: true, mfaRequired: true }], pagination: { page: 1, totalPages: 1, total: 1 } } });
    });
});
afterEach(cleanup);

describe("user management feedback and dynamic values", () => {
    it("localizes both temporary-password messages without altering the generated value", async () => {
        const { rerender } = render(<Page locale="fr-CA" />);
        fireEvent.click(await screen.findByRole("button", { name: labels.pageUi.modifier }));
        fireEvent.click(screen.getByRole("button", { name: labels.auth.userManagement.passwordGenerateAction }));
        await screen.findByText(temporaryPassword);
        for (const locale of ["fr-CA", "en-CA", "es"]) {
            rerender(<Page locale={locale} />);
            const message = getLocalUiTranslation(labels.pageUi.temporaryPassword, locale)!.replace("{password}", temporaryPassword)
                + getLocalUiTranslation(labels.pageUi.lUtilisateurDevraLeRemplacerALaPremiereConnexion, locale)!;
            expect(screen.getAllByText(message)).toHaveLength(2);
            expect(screen.getByText(temporaryPassword)).toBeInTheDocument();
            expect(screen.getByText(/Compte synthétique/)).toBeInTheDocument();
        }
        expect(api.reauth).toHaveBeenCalledTimes(1);
        expect(api.authFetch.mock.calls.filter(([url]) => url.includes("reset-password"))).toHaveLength(1);
    });

    it("translates the save-error prefix and uses a localized fallback for unknown server details", async () => {
        api.authFetch.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "PATCH"
            ? response({ error: { message: "Erreur synthétique inconnue" } }, false)
            : response({ data: { users: [{ id: "synthetic-user", username: "Compte synthétique", email: null,
                role: "MEDECIN", isActive: true }], pagination: { page: 1, totalPages: 1, total: 1 } } }));
        const { rerender } = render(<Page locale="fr-CA" />);
        fireEvent.click(await screen.findByRole("button", { name: labels.pageUi.modifier }));
        fireEvent.click(screen.getByRole("button", { name: labels.pageUi.sauvegarderLesModifications }));
        await screen.findByText(labels.pageUi.saveFailed.replace("{message}", labels.generalUi.error));
        rerender(<Page locale="en-CA" />);
        expect(screen.getByText(getLocalUiTranslation(labels.pageUi.saveFailed, "en-CA")!
            .replace("{message}", getLocalUiTranslation(labels.generalUi.error, "en-CA")!))).toBeInTheDocument();
        expect(screen.queryByText("Erreur synthétique inconnue")).not.toBeInTheDocument();
    });
});
