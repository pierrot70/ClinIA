import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    createClinicianComment,
    replyToClinicianComment,
} = vi.hoisted(() => ({
    createClinicianComment: vi.fn(),
    replyToClinicianComment: vi.fn(),
}));

const { recordWriteOperationAuditEvent } = vi.hoisted(() => ({
    recordWriteOperationAuditEvent: vi.fn(),
}));

const { getReplicaSetStatus } = vi.hoisted(() => ({
    getReplicaSetStatus: vi.fn(),
}));

vi.mock("../../services/clinicianComments.js", () => ({
    acknowledgeClinicianCommentsInbox: vi.fn(),
    createClinicianComment,
    listClinicianComments: vi.fn(),
    listNewClinicianCommentsInbox: vi.fn(),
    lookupClinicianReplies: vi.fn(),
    replyToClinicianComment,
}));

vi.mock("../../audit/writeOperationAudit.js", () => ({
    recordWriteOperationAuditEvent,
}));

vi.mock("../../services/dbStatus.js", () => ({
    getReplicaSetStatus,
}));

import router from "../clinicianComments.js";

function makeRes() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

function getRouteHandler(method, path) {
    const layer = router.stack.find(
        (entry) =>
            entry.route?.path === path &&
            entry.route?.methods?.[method] === true
    );

    if (!layer) {
        throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
    }

    return layer.route.stack.at(-1).handle;
}

describe("clinician comments routes write verification", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        recordWriteOperationAuditEvent.mockResolvedValue(true);
        getReplicaSetStatus.mockResolvedValue({
            summary: {
                status: "OK",
                memberCount: 3,
                healthyCount: 3,
                primaryCount: 1,
                secondaryCount: 2,
                majorityAvailable: true,
                maxLagSeconds: 0,
                laggingThresholdSeconds: 10,
            },
        });
    });

    it("returns a write verification receipt on clinician comment creation", async () => {
        const handler = getRouteHandler("post", "/");
        const data = {
            id: "comment-1",
            actorUsername: "doctor.one",
            actorRole: "MEDECIN",
            category: "SUGGESTION",
            trackingCode: "ABCDEFGH",
        };

        createClinicianComment.mockResolvedValue(data);

        const req = {
            body: {
                comment: "Commentaire de verification",
                category: "SUGGESTION",
            },
            headers: {
                "x-client-mutation-id": "clinician-comment-create-client-1",
            },
            auth: {
                userId: "user-1",
                username: "doctor.one",
                role: "MEDECIN",
            },
            ip: "10.0.0.10",
            originalUrl: "/api/clinician-comments",
            requestContext: {
                requestId: "request-comment-create",
                instanceId: "instance-a",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                collectionName: "cliniciancomments",
                operation: "CREATE",
                outcome: "SUCCESS",
                verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                clientMutationId: "clinician-comment-create-client-1",
                actorUserId: "user-1",
                actorUsername: "doctor.one",
                actorRole: "MEDECIN",
                resourceId: "comment-1",
                changedFields: [
                    "actorUsername",
                    "category",
                    "comment",
                    "trackingCodeHash",
                ],
            })
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification: {
                    status: "CONFIRMED",
                    verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                    clientMutationId: "clinician-comment-create-client-1",
                },
            },
        });
    });

    it("returns a write verification receipt on clinician comment reply", async () => {
        const handler = getRouteHandler("post", "/:id/reply");
        const data = {
            id: "comment-2",
            replies: [{ message: "Reponse redactee" }],
        };

        replyToClinicianComment.mockResolvedValue(data);

        const req = {
            params: { id: "comment-2" },
            body: { message: "Reponse de verification" },
            headers: {
                "x-forwarded-for": "203.0.113.15, 10.0.0.10",
                "x-client-mutation-id": "clinician-comment-reply-client-1",
            },
            auth: {
                userId: "admin-1",
                username: "admin.one",
                role: "SUPERADMIN",
            },
            ip: "10.0.0.10",
            originalUrl: "/api/clinician-comments/comment-2/reply",
            requestContext: {
                requestId: "request-comment-reply",
                instanceId: "instance-b",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(recordWriteOperationAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                collectionName: "cliniciancomments",
                operation: "REPLY",
                outcome: "SUCCESS",
                verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                clientMutationId: "clinician-comment-reply-client-1",
                ip: "10.0.0.10",
                resourceId: "comment-2",
                changedFields: ["replies"],
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            data,
            meta: {
                source: "real",
                model: "mongo",
                writeVerification: {
                    status: "CONFIRMED",
                    verificationId: expect.stringMatching(/^WRV-[A-Z0-9]+-[A-F0-9]{12}$/),
                    clientMutationId: "clinician-comment-reply-client-1",
                },
            },
        });
    });
});
