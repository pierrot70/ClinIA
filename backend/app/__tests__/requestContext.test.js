import { describe, expect, it, vi } from "vitest";

import {
    createRequestContextMiddleware,
    getRequestContext,
} from "../requestContext.js";

describe("request context", () => {
    it("assigns instance and request identifiers", () => {
        const middleware = createRequestContextMiddleware({
            instanceId: "instance-test",
            makeRequestId: () => "request-test",
        });
        const req = {};
        const res = { setHeader: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(req.requestContext).toEqual({
            instanceId: "instance-test",
            requestId: "request-test",
        });
        expect(res.setHeader).toHaveBeenCalledWith(
            "X-Request-ID",
            "request-test"
        );
        expect(res.setHeader).toHaveBeenCalledWith(
            "X-ClinIA-Instance",
            "instance-test"
        );
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("generates a new request identifier for each request", () => {
        const makeRequestId = vi
            .fn()
            .mockReturnValueOnce("request-a")
            .mockReturnValueOnce("request-b");
        const middleware = createRequestContextMiddleware({
            instanceId: "instance-test",
            makeRequestId,
        });
        const firstReq = {};
        const secondReq = {};
        const res = { setHeader: vi.fn() };

        middleware(firstReq, res, vi.fn());
        middleware(secondReq, res, vi.fn());

        expect(getRequestContext(firstReq).requestId).toBe("request-a");
        expect(getRequestContext(secondReq).requestId).toBe("request-b");
    });
});
