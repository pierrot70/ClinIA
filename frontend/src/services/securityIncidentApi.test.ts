import { describe, expect, it, vi, beforeEach } from "vitest";

const { authFetchMock } = vi.hoisted(() => ({
    authFetchMock: vi.fn(),
}));

vi.mock("./authService", () => ({
    authFetch: authFetchMock,
    SessionExpiredError: class SessionExpiredError extends Error {
        constructor(message = "Session expired") {
            super(message);
            this.name = "SessionExpiredError";
        }
    },
}));

vi.mock("./securityIncidentGuard", () => ({
    withSecurityIncidentGuard: (apiCall: Promise<unknown>) => apiCall,
}));

import {
    acknowledgeSecurityIncident,
    listSecurityIncidents,
} from "./securityIncidentApi";

describe("securityIncidentApi", () => {
    beforeEach(() => {
        authFetchMock.mockReset();
    });

    it("uses authFetch to acknowledge a protected security incident", async () => {
        authFetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    incidentId: "abc123",
                    acknowledged: true,
                    acknowledgedAt: "2026-05-23T10:00:00.000Z",
                    action: "J'ai lu et compris",
                    context: { source: "test" },
                },
            }),
        });

        const result = await acknowledgeSecurityIncident({
            incidentId: "abc123",
            action: "J'ai lu et compris",
            context: { source: "test" },
        });

        expect(authFetchMock).toHaveBeenCalledWith(
            "/api/security/incidents/acknowledge",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    incidentId: "abc123",
                    action: "J'ai lu et compris",
                    context: { source: "test" },
                }),
            }
        );
        expect(result).toEqual({
            data: {
                incidentId: "abc123",
                acknowledged: true,
                acknowledgedAt: "2026-05-23T10:00:00.000Z",
                action: "J'ai lu et compris",
                context: { source: "test" },
            },
        });
    });

    it("builds the protected incidents list query with authFetch", async () => {
        authFetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    incidents: [],
                    pagination: {
                        page: 2,
                        limit: 5,
                        total: 0,
                        totalPages: 0,
                    },
                },
            }),
        });

        await listSecurityIncidents({
            page: 2,
            limit: 5,
            acknowledged: "false",
            type: "PROMPT_INJECTION",
        });

        expect(authFetchMock).toHaveBeenCalledWith(
            "/api/security/incidents?page=2&limit=5&acknowledged=false&type=PROMPT_INJECTION"
        );
    });
});
