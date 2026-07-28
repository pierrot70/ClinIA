import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { MfaRequiredError, MfaVerificationError } from "../services/authService";

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
        useHomeI18n: () => ({ locale: "fr" }),
    };
});

import LoginPage from "./LoginPage";

describe("LoginPage MFA recovery codes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
});
