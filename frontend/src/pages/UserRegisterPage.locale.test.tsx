import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const roleExpectations = [
    ["fr-CA", ["Utilisateur", "Réceptionniste", "Médecin", "Administrateur", "Superadministrateur"]],
    ["en-CA", ["User", "Receptionist", "Physician", "Administrator", "Super administrator"]],
    ["es", ["Usuario", "Recepcionista", "Médico", "Administrador", "Superadministrador"]],
    ["ko-KR", ["사용자", "접수 담당자", "의사", "관리자", "최고 관리자"]],
    ["vi", ["Người dùng", "Nhân viên lễ tân", "Bác sĩ", "Quản trị viên", "Quản trị viên cấp cao"]],
    ["no-NO", ["Bruker", "Resepsjonist", "Lege", "Administrator", "Superadministrator"]],
    ["ja", ["ユーザー", "受付担当者", "医師", "管理者", "上級管理者"]],
    ["zh", ["用户", "接待员", "医生", "管理员", "超级管理员"]],
    ["he", ["משתמש", "פקיד קבלה", "רופא", "מנהל", "מנהל על"]],
] as const;
const roleCodes = ["USER", "RECEPTION", "MEDECIN", "ADMIN", "SUPERADMIN"];

describe("user management role display names", () => {
    it.each(roleExpectations)("translates creation, filters, editing and the user list in %s while preserving API codes", async (locale, expected) => {
        render(<Page locale={locale} />);
        fireEvent.click(await screen.findByRole("button", { name: getLocalUiTranslation(labels.pageUi.modifier, locale)! }));
        for (const [index, name] of expected.entries()) {
            const options = screen.getAllByRole("option", { name });
            expect(options).toHaveLength(3);
            for (const option of options) expect(option).toHaveValue(roleCodes[index]);
        }
        expect(screen.getByText(`Compte synthétique (${expected[2]})`)).toBeVisible();
        expect(api.authFetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
    });

    it("keeps selected codes on language changes and sends the internal role when filtering and saving", async () => {
        const { rerender } = render(<Page locale="en-CA" />);
        fireEvent.click(await screen.findByRole("button", { name: getLocalUiTranslation(labels.pageUi.modifier, "en-CA")! }));
        const roleSelects = screen.getAllByRole("option", { name: "Administrator" }).map(option => option.closest("select")!);
        const editSelect = roleSelects.find(select => select.id === "edit-role")!;
        const filterSelect = roleSelects.find(select => select.id === "users-role-filter")!;
        const creationSelect = roleSelects.find(select => select.id === "role")!;
        fireEvent.change(editSelect, { target: { value: "ADMIN" } });
        fireEvent.change(filterSelect, { target: { value: "SUPERADMIN" } });
        fireEvent.change(creationSelect, { target: { value: "USER" } });
        rerender(<Page locale="ja" />);
        expect(editSelect).toHaveValue("ADMIN");
        expect(filterSelect).toHaveValue("SUPERADMIN");
        expect(creationSelect).toHaveValue("USER");
        expect(screen.getByText("Compte synthétique (医師)")).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(labels.pageUi.sauvegarderLesModifications, "ja")! }));
        await waitFor(() => expect(api.authFetch.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(true));
        const [, request] = api.authFetch.mock.calls.find(([, options]) => options?.method === "PATCH")!;
        expect(JSON.parse(request.body).role).toBe("ADMIN");
        expect(api.reauth).toHaveBeenCalledOnce();
        fireEvent.submit(filterSelect.closest("form")!);
        await waitFor(() => expect(api.authFetch.mock.calls.some(([url]) => url.includes("role=SUPERADMIN"))).toBe(true));
    });
});
