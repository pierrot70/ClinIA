import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import LoginPage from "./LoginPage";

const auth = vi.hoisted(() => ({ registerSelf: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: false, user: null,
    login: vi.fn(), logout: vi.fn(), completeMfaLogin: vi.fn(), registerSelf: auth.registerSelf }) }));
vi.mock("../services/translationApi", () => ({ translateText: vi.fn().mockResolvedValue("") }));

function Page({ locale }: { locale: string }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><LoginPage /></HomeI18nContext.Provider></MemoryRouter>;
}
beforeEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); auth.registerSelf.mockResolvedValue({ user: { role: "USER" } }); });
afterEach(cleanup);

const expected = [
    ["fr-CA", ["Médecin", "Utilisateur", "Administrateur", "Superadministrateur"]],
    ["en-CA", ["Physician", "User", "Administrator", "Super administrator"]],
    ["es", ["Médico", "Usuario", "Administrador", "Superadministrador"]],
    ["ko-KR", ["의사", "사용자", "관리자", "최고 관리자"]],
    ["vi", ["Bác sĩ", "Người dùng", "Quản trị viên", "Quản trị viên cấp cao"]],
    ["no-NO", ["Lege", "Bruker", "Administrator", "Superadministrator"]],
    ["ja", ["医師", "ユーザー", "管理者", "上級管理者"]],
    ["zh", ["医生", "用户", "管理员", "超级管理员"]],
    ["he", ["רופא", "משתמש", "מנהל", "מנהל על"]],
] as const;

describe("registration role display names", () => {
    it.each(expected)("translates the existing registration choices in %s without submitting anything", (locale, names) => {
        render(<Page locale={locale} />);
        const toggle = getLocalUiTranslation(UI_LABELS_FR.loginPage.modeToggle.createAccount, locale)!;
        fireEvent.click(screen.getByRole("button", { name: toggle }));
        for (const [index, name] of names.entries()) {
            expect(screen.getByRole("option", { name })).toHaveValue(["MEDECIN", "USER", "ADMIN", "SUPERADMIN"][index]);
        }
        expect(screen.getAllByRole("option")).toHaveLength(4);
        expect(auth.registerSelf).not.toHaveBeenCalled();
    });

    it("preserves the selected code after switching languages and submits that code", async () => {
        const { rerender } = render(<Page locale="en-CA" />);
        fireEvent.click(screen.getByRole("button", { name: getLocalUiTranslation(UI_LABELS_FR.loginPage.modeToggle.createAccount, "en-CA")! }));
        const select = screen.getByRole("option", { name: "Physician" }).closest("select")!;
        fireEvent.change(select, { target: { value: "MEDECIN" } });
        rerender(<Page locale="ja" />);
        expect(select).toHaveValue("MEDECIN");
        expect(screen.getByRole("option", { name: "医師" })).toHaveProperty("selected", true);
        const form = select.closest("form")!;
        fireEvent.change(form.querySelector('input[type="email"]')!, { target: { value: "synthetic@example.test" } });
        fireEvent.change(form.querySelector('input[type="password"]')!, { target: { value: "SyntheticPassword123!" } });
        fireEvent.submit(form);
        await waitFor(() => expect(auth.registerSelf).toHaveBeenCalledWith({ email: "synthetic@example.test", password: "SyntheticPassword123!", role: "MEDECIN" }));
    });
});
