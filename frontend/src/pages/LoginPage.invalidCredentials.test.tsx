import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { getLocalUiTranslation } from "../i18n/localUiTranslations";
import LoginPage from "./LoginPage";

const { fetchMock, translateTextMock } = vi.hoisted(() => ({
    fetchMock: vi.fn(), translateTextMock: vi.fn(),
}));
vi.mock("../hooks/useAuth", async () => {
    const service = await import("../services/authService");
    return { useAuth: () => ({ isAuthenticated: false, user: null, login: service.login,
        completeMfaLogin: service.completeMfaLogin, logout: vi.fn(), registerSelf: vi.fn() }) };
});
vi.mock("../services/translationApi", () => ({ translateText: translateTextMock }));

const backendMessage = "Nom d'utilisateur ou mot de passe invalide.";
const variants = [
    ["fr-CA", "Identifiants invalides."],
    ["en-CA", "Invalid credentials."],
    ["es", "Credenciales incorrectas."],
    ["ko-KR", "로그인 정보가 올바르지 않습니다."],
    ["vi", "Thông tin đăng nhập không hợp lệ."],
    ["no-NO", "Ugyldig påloggingsinformasjon."],
    ["ja", "認証情報が正しくありません。"],
    ["zh", "登录信息无效。"],
    ["he", "פרטי ההתחברות שגויים."],
] as const;
function Page({ locale }: { locale: string }) {
    return <MemoryRouter><HomeI18nContext.Provider value={{ locale } as React.ContextType<typeof HomeI18nContext>}>
        <LoginPage />
    </HomeI18nContext.Provider></MemoryRouter>;
}
function response(code = "INVALID_CREDENTIALS", message = backendMessage) {
    return new Response(JSON.stringify({ error: { code, message, retryable: false } }),
        { status: 401, headers: { "Content-Type": "application/json" } });
}
function submit(container: HTMLElement) {
    fireEvent.change(container.querySelector("#email")!, { target: { value: "synthetic-user" } });
    fireEvent.change(container.querySelector("#password")!, { target: { value: "synthetic-invalid-password" } });
    fireEvent.submit(container.querySelector("form")!);
}
beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    fetchMock.mockImplementation(async (input: string) => input.endsWith("/api/auth/login")
        ? response() : new Response(JSON.stringify({ data: { passwordRecoveryAvailable: false } }),
            { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("invalid credentials login UI", () => {
    it.each(variants)("renders a neutral localized credential rejection through the real frontend auth service in %s", async (locale, expected) => {
        const { container } = render(<Page locale={locale} />);
        submit(container);
        expect(await screen.findByText(expected)).toBeInTheDocument();
        expect(screen.queryByText(backendMessage)).not.toBeInTheDocument();
        expect(screen.queryByText(getLocalUiTranslation(UI_LABELS_FR.generalUi.error, locale)!)).not.toBeInTheDocument();
        expect(translateTextMock).not.toHaveBeenCalled();
    });

    it("uses the same rejection regardless of server prose and updates it when UI language changes", async () => {
        const hidden = "Synthetic private account detail";
        fetchMock.mockImplementation(async () => response("INVALID_CREDENTIALS", hidden));
        const { container, rerender } = render(<Page locale="es" />);
        submit(container);
        expect(await screen.findByText("Credenciales incorrectas.")).toBeInTheDocument();
        rerender(<Page locale="he" />);
        expect(screen.getByText("פרטי ההתחברות שגויים.")).toBeInTheDocument();
        expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    });

    it("keeps an unrelated unknown error on the generic localized fallback", async () => {
        fetchMock.mockImplementation(async () => response("INTERNAL_ERROR", "Synthetic unknown server failure"));
        const { container } = render(<Page locale="es" />);
        submit(container);
        expect(await screen.findByText(getLocalUiTranslation(UI_LABELS_FR.generalUi.error, "es")!)).toBeInTheDocument();
        expect(screen.queryByText("Credenciales incorrectas.")).not.toBeInTheDocument();
        expect(screen.queryByText("Synthetic unknown server failure")).not.toBeInTheDocument();
    });
});
