import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authService = vi.hoisted(() => ({
    bootstrapSession: vi.fn(),
    completeMfaLogin: vi.fn(),
    getUser: vi.fn(),
    hasActiveSession: vi.fn(),
    getValidAccessToken: vi.fn(),
    authFetch: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    reauthenticate: vi.fn(),
    registerSelf: vi.fn(),
    refreshAccessToken: vi.fn(),
}));

vi.mock("../services/authService", () => authService);

import { AuthProvider, useAuthContext } from "./AuthContext";

function MfaCompletionProbe() {
    const { completeMfaLogin, status, user } = useAuthContext();

    return (
        <>
            <output data-testid="session-status">{status}</output>
            <output data-testid="session-user">{user?.email || "none"}</output>
            <button
                type="button"
                onClick={() => {
                    void completeMfaLogin(
                        { mfaChallenge: "challenge", enrollmentRequired: false },
                        "123456"
                    );
                }}
            >
                Complete MFA
            </button>
        </>
    );
}

describe("AuthContext MFA completion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authService.bootstrapSession.mockResolvedValue(null);
        authService.completeMfaLogin.mockResolvedValue({
            session: {
                accessToken: "access-token",
                user: {
                    id: "user-1",
                    email: "doctor@clinia.test",
                    role: "MEDECIN",
                    passwordResetRequired: false,
                    mustChangePasswordOnNextLogin: false,
                },
            },
            recoveryCodes: [],
        });
    });

    it("marks the context authenticated after successful MFA completion", async () => {
        render(
            <AuthProvider>
                <MfaCompletionProbe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId("session-status")).toHaveTextContent("unauthenticated");
        });

        fireEvent.click(screen.getByRole("button", { name: "Complete MFA" }));

        await waitFor(() => {
            expect(screen.getByTestId("session-status")).toHaveTextContent("authenticated");
            expect(screen.getByTestId("session-user")).toHaveTextContent("doctor@clinia.test");
        });
    });
});
