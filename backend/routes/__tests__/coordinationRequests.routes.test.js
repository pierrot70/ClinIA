import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCoordinationRequests, verifyCoordinationRequestAvailability } = vi.hoisted(() => ({
    listCoordinationRequests: vi.fn(),
    verifyCoordinationRequestAvailability: vi.fn(),
}));
const { recordWriteOperationAuditEvent } = vi.hoisted(() => ({
    recordWriteOperationAuditEvent: vi.fn(),
}));

vi.mock("../../services/coordinationRequests.js", () => ({ listCoordinationRequests, verifyCoordinationRequestAvailability }));
vi.mock("../../audit/writeOperationAudit.js", () => ({ recordWriteOperationAuditEvent }));

import router from "../coordinationRequests.js";

function makeRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

function routeHandler(method, path) {
    const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
    if (!layer) throw new Error(`Route ${method} ${path} not found`);
    return layer.route.stack.at(-1).handle;
}

describe("coordination requests routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        recordWriteOperationAuditEvent.mockResolvedValue(true);
    });

    it("returns the protected queue", async () => {
        listCoordinationRequests.mockResolvedValue({ requests: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
        const res = makeRes();
        await routeHandler("get", "/")({ auth: { role: "ADMIN" }, query: { status: "open" } }, res);
        expect(listCoordinationRequests).toHaveBeenCalledWith(expect.objectContaining({ status: "open" }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("audits an availability verification without logging patient identifiers", async () => {
        verifyCoordinationRequestAvailability.mockResolvedValue({
            request: {
                _id: "request-1",
                patient: "patient-1",
                status: "ready_to_schedule",
            },
            availability: {
                clinique: { id: "clinic-1", nom: "Clinique test" },
                specialist: { id: "specialist-1", nom: "Test", prenom: "Dr" },
                date: "2099-08-03",
                time: "09:00",
            },
        });
        const req = {
            params: { id: "request-1" },
            auth: { userId: "admin-1", username: "admin", role: "ADMIN" },
            requestContext: { requestId: "request-context", instanceId: "instance-1" },
            ip: "10.0.0.1",
        };
        const res = makeRes();
        await routeHandler("patch", "/:id/verify-availability")(req, res);
        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            collectionName: "appointmentcoordinationrequests",
            operation: "UPDATE",
            resourceId: "request-1",
            patientId: "patient-1",
            changedFields: ["availabilityVerifiedAt", "status"],
        }));
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
