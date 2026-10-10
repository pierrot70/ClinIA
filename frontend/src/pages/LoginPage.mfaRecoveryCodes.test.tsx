import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { MfaRequiredError, MfaVerificationError } from "../services/authService";

const language = vi.hoisted(() => ({ locale: "fr" }));

const auth = vi.hoisted(() => ({
    completeMfaLogin: vi.fn(),
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    passwordResetRequired: false,
    mustChangePasswordOnNextLogin: false,
    registerSelf: vi.fn(),
    user: null as null | { id: string; email: string; role: "SUPERADMIN" },
}));

vi.mock("../hooks/useAuth", () => ({
    useAuth: () => ({
        ...auth,
        user: auth.user,
    }),
}));

vi.mock("../contexts/HomeI18nContext", async () => {
    const actual = await vi.importActual<typeof import("../contexts/HomeI18nContext")>(
        "../contexts/HomeI18nContext"
    );
    return {
        ...actual,
        useHomeI18n: () => ({ locale: language.locale }),
    };
});

import LoginPage from "./LoginPage";

describe("LoginPage MFA recovery codes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        language.locale = "fr";
        window.sessionStorage.clear();
        auth.isAuthenticated = false;
        auth.user = null;
        auth.login.mockRejectedValue(
            new MfaRequiredError({
                mfaChallenge: "mfa-enrollment-challenge",
                enrollmentRequired: true,
                manualEntryKey: "TESTMFASECRET",
            })
        );
        auth.completeMfaLogin.mockImplementation(async () => {
            auth.isAuthenticated = true;
            auth.user = {
                id: "user-1",
                email: "local-medecin@clinia.test",
                role: "SUPERADMIN",
            };
            return {
                session: {
                    accessToken: "access-token",
                    user: auth.user,
                },
                recoveryCodes: ["RECOVERY-ONE", "RECOVERY-TWO"],
            };
        });
    });

    it("passes an existing password over 72 bytes to login unchanged", async () => {
        const password = "é".repeat(64);
        render(<MemoryRouter><LoginPage /></MemoryRouter>);
        fireEvent.change(screen.getByLabelText("Identifiant (courriel ou nom d'utilisateur)"), {
            target: { value: "legacy@clinia.test" },
        });
        fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: password } });
        fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
        await waitFor(() => expect(auth.login).toHaveBeenCalledWith({ email: "legacy@clinia.test", password }));
    });

    it("shows a full-screen explanation when a newer sign-in replaced this session", async () => {
        window.sessionStorage.setItem(
            "clinia.auth.security_notice",
            JSON.stringify({
                code: "SESSION_REPLACED",
                message: "Cette session a ete remplacee.",
            })
        );

        render(
            <MemoryRouter initialEntries={["/login"]}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByRole("alertdialog")).toHaveTextContent(
            "Une connexion plus recente a remplace cette session."
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Se reconnecter avec MFA" })
        );

        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
    });

    it("shows recovery codes before redirecting after a successful MFA enrollment", async () => {
        render(
            <MemoryRouter initialEntries={["/admin/login"]}>
                <Routes>
                    <Route path="/admin/login" element={<LoginPage adminOnly />} />
                    <Route path="/mock-studio" element={<p>Mock Studio</p>} />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.change(
            screen.getByLabelText("Identifiant (courriel ou nom d'utilisateur)"),
            { target: { value: "local-medecin@clinia.test" } }
        );
        fireEvent.change(screen.getByLabelText("Mot de passe"), {
            target: { value: "password123" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

        await screen.findByText("Verification a deux facteurs");

        fireEvent.change(
            screen.getByLabelText("Code de verification ou code de recuperation"),
            { target: { value: "123456" } }
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Verifier et se connecter" })
        );

        await waitFor(() => {
            expect(screen.getByText("Codes de recuperation")).toBeInTheDocument();
            expect(
                screen.getByText(
                    (_content, element) =>
                        element?.tagName === "PRE" &&
                        element.textContent?.includes("RECOVERY-ONE") === true
                )
            ).toBeInTheDocument();
            expect(screen.queryByText("Mock Studio")).not.toBeInTheDocument();
        });
    });

    it("returns to password login when the MFA challenge has been exhausted", async () => {
        auth.login.mockRejectedValueOnce(
            new MfaRequiredError({
                mfaChallenge: "mfa-login-challenge",
                enrollmentRequired: false,
            })
        );
        auth.completeMfaLogin.mockRejectedValueOnce(
            new MfaVerificationError(
                "INVALID_MFA_CHALLENGE",
                "Verification MFA invalide ou expiree."
            )
        );

        render(
            <MemoryRouter initialEntries={["/login"]}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.change(
            screen.getByLabelText("Identifiant (courriel ou nom d'utilisateur)"),
            { target: { value: "local-medecin@clinia.test" } }
        );
        fireEvent.change(screen.getByLabelText("Mot de passe"), {
            target: { value: "password123" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

        await screen.findByText("Verification a deux facteurs");
        fireEvent.change(
            screen.getByLabelText("Code de verification ou code de recuperation"),
            { target: { value: "112233" } }
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Verifier et se connecter" })
        );

        await waitFor(() => {
            expect(
                screen.getByText(
                    "Ce defi MFA n'est plus valide. Reconnectez-vous avec vos identifiants pour obtenir un nouveau defi."
                )
            ).toBeInTheDocument();
            expect(screen.queryByText("Verification a deux facteurs")).not.toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
        });
    });

    it("returns to password login with a cooldown message after five invalid MFA codes", async () => {
        auth.login.mockRejectedValueOnce(
            new MfaRequiredError({
                mfaChallenge: "mfa-login-challenge",
                enrollmentRequired: false,
            })
        );
        auth.completeMfaLogin.mockRejectedValueOnce(
            new MfaVerificationError(
                "MFA_TEMPORARILY_LOCKED",
                "Verification MFA temporairement bloquee suite a trop d'echecs.",
                "2026-07-27T16:15:00.000Z"
            )
        );

        render(
            <MemoryRouter initialEntries={["/login"]}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.change(
            screen.getByLabelText("Identifiant (courriel ou nom d'utilisateur)"),
            { target: { value: "local-medecin@clinia.test" } }
        );
        fireEvent.change(screen.getByLabelText("Mot de passe"), {
            target: { value: "password123" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

        await screen.findByText("Verification a deux facteurs");
        fireEvent.change(
            screen.getByLabelText("Code de verification ou code de recuperation"),
            { target: { value: "112233" } }
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Verifier et se connecter" })
        );

        await waitFor(() => {
            expect(
                screen.getByText(
                    "Trop de codes MFA invalides. Reessayez dans 15 minutes avec vos identifiants."
                )
            ).toBeInTheDocument();
            expect(screen.queryByText("Verification a deux facteurs")).not.toBeInTheDocument();
        });
    });
    it("translates invalid credentials and an existing error when the locale changes", async () => {
        language.locale = "en-CA";
        auth.login.mockRejectedValue(new Error("Identifiants invalides."));
        const { rerender } = render(<MemoryRouter><LoginPage /></MemoryRouter>);
        fireEvent.submit(document.querySelector("form")!);
        expect(await screen.findByText("Invalid credentials.")).toBeInTheDocument();
        expect(screen.queryByText("Identifiants invalides.")).not.toBeInTheDocument();
        language.locale = "fr-CA";
        rerender(<MemoryRouter><LoginPage /></MemoryRouter>);
        expect(await screen.findByText("Identifiants invalides.")).toBeInTheDocument();
    });

    it("shows English MFA labels and invalid-code errors, then switches back to French", async () => {
        language.locale = "en-CA";
        auth.completeMfaLogin.mockRejectedValue(new MfaVerificationError("INVALID_MFA_CODE", "Code MFA invalide."));
        const { rerender } = render(<MemoryRouter><LoginPage /></MemoryRouter>);
        fireEvent.submit(document.querySelector("form")!);
        expect(await screen.findByText("Two-factor verification")).toBeInTheDocument();
        expect(screen.getByText("Add this key to your authenticator app, then enter the displayed code.")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Verification code or recovery code"), { target: { value: "000000" } });
        fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
        expect(await screen.findByText("Invalid MFA code.")).toBeInTheDocument();
        language.locale = "fr-CA";
        rerender(<MemoryRouter><LoginPage /></MemoryRouter>);
        expect(await screen.findByText("Verification a deux facteurs")).toBeInTheDocument();
        expect(await screen.findByText("Code MFA invalide.")).toBeInTheDocument();
    });

});
