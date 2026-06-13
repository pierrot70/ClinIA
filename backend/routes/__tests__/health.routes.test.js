import { describe, expect, it, vi } from "vitest";

import { createReadinessHandler, getLiveness } from "../health.js";

const request = {
    requestContext: {
        instanceId: "instance-test",
        requestId: "request-test",
    },
};

const healthMeta = {
    source: "real",
    model: "health",
    instanceId: "instance-test",
    requestId: "request-test",
};

describe("health routes", () => {
    it("reports that the Express process is alive", () => {
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));

        getLiveness(request, { status });

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith({
            data: {
                status: "ok",
                check: "liveness",
            },
            meta: healthMeta,
        });
    });

    it("reports ready when Mongo is connected", () => {
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        const getReadiness = createReadinessHandler({
            connection: { readyState: 1 },
        });

        getReadiness(request, { status });

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith({
            data: {
                status: "ok",
                check: "readiness",
                dependencies: {
                    mongo: "connected",
                },
            },
            meta: healthMeta,
        });
    });

    it.each([0, 2, 3, undefined])(
        "reports unavailable when Mongo readyState is %s",
        (readyState) => {
            const json = vi.fn();
            const status = vi.fn(() => ({ json }));
            const getReadiness = createReadinessHandler({
                connection: { readyState },
            });

            getReadiness(request, { status });

            expect(status).toHaveBeenCalledWith(503);
            expect(json).toHaveBeenCalledWith({
                data: {
                    status: "unavailable",
                    check: "readiness",
                    dependencies: {
                        mongo: "unavailable",
                    },
                },
                meta: healthMeta,
            });
        }
    );
});
