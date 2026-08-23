import { beforeEach, describe, expect, it, vi } from "vitest";

const { authFetchMock } = vi.hoisted(() => ({
    authFetchMock: vi.fn(),
}));

vi.mock("./authService", () => ({
    authFetch: authFetchMock,
}));

vi.mock("./securityIncidentGuard", () => ({
    withSecurityIncidentGuard: (apiCall: Promise<unknown>) => apiCall,
}));

import { resolveSpecialistAvailabilityRequest } from "./appointmentsApi";

describe("resolveSpecialistAvailabilityRequest", () => {
    beforeEach(() => {
        authFetchMock.mockReset();
    });

    it("sends the PATCH that resolves a management availability request", async () => {
        authFetchMock.mockResolvedValue({
            json: async () => ({
                data: { id: "66d000000000000000000001", status: "resolved" },
            }),
        });

        await expect(
            resolveSpecialistAvailabilityRequest("66d000000000000000000001")
        ).resolves.toEqual({
            data: { id: "66d000000000000000000001", status: "resolved" },
        });

        expect(authFetchMock).toHaveBeenCalledWith(
            "http://localhost:4000/api/appointments/availability-requests/66d000000000000000000001/resolve",
            { method: "PATCH" }
        );
    });
});
