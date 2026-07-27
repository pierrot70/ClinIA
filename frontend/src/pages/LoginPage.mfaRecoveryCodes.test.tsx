import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { MfaRequiredError } from "../services/authService";

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
});
