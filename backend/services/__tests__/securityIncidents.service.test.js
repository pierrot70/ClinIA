import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findById = vi.fn();

vi.mock("../../models/SecurityIncident.js", () => ({
    SecurityIncident: {
        create,
        findById,
    },
}));

const {
    acknowledgeSecurityIncident,
    createSecurityIncident,
} = await import("../securityIncidents.js");

beforeEach(() => {
    vi.clearAllMocks();
});

describe("security incidents service", () => {
    it("creates incident with default type", async () => {
        create.mockResolvedValue({ _id: "abc" });

        await createSecurityIncident({
            phase: "pre_cloud",
            reason: "Detected",
            requestPath: "/api/ai/analyze",
        });

        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0].type).toBe("NON_SECURE_CONTENT");
    });

    it("records explicit acknowledgment with timestamp and context", async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const incident = {
            _id: "507f1f77bcf86cd799439011",
            acknowledged: false,
            save,
        };
        findById.mockResolvedValue(incident);

        const result = await acknowledgeSecurityIncident({
            incidentId: "507f1f77bcf86cd799439011",
            action: "J'ai lu et compris",
            context: { userId: "doctor-1" },
        });

        expect(result.acknowledged).toBe(true);
        expect(result.acknowledgmentAction).toBe("J'ai lu et compris");
        expect(result.acknowledgedAt).toBeInstanceOf(Date);
        expect(result.acknowledgmentContext).toEqual({ userId: "doctor-1" });
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("rejects any acknowledgment action that does not match required phrase", async () => {
        await expect(
            acknowledgeSecurityIncident({
                incidentId: "507f1f77bcf86cd799439011",
                action: "ok",
            })
        ).rejects.toMatchObject({
            code: "INVALID_ACK_ACTION",
        });
    });
});
