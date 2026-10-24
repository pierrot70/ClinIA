import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/validationReports.js", () => ({ deployedVersion: vi.fn() }));
import { deployedVersion } from "../../services/validationReports.js";

import { createReadinessHandler, getLiveness } from "../health.js";

const request = {
    requestContext: {
        instanceId: "instance-test",
        requestId: "request-test",
    },
};

const deployment = { commit: "a".repeat(40), source: "image-build" };
vi.mocked(deployedVersion).mockResolvedValue(deployment);
afterEach(() => { vi.mocked(deployedVersion).mockResolvedValue(deployment); });

const healthMeta = {
    deployment,
    source: "real",
    model: "health",
    instanceId: "instance-test",
    requestId: "request-test",
};

describe("health routes", () => {
    it.each(["live", "ready"])("keeps %s healthy when image revision is unknown", async (check) => {
        vi.mocked(deployedVersion).mockResolvedValue({ commit: null, source: "unknown" });
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        const setHeader = vi.fn();
        const handler = check === "live" ? getLiveness : createReadinessHandler({ connection: { readyState: 1 } });
        await handler(request, { status, setHeader });
        expect(status).toHaveBeenCalledWith(200);
        expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(json.mock.calls[0][0].meta.deployment).toEqual({ commit: null, source: "unknown" });
    });

    it("reports that the Express process is alive", async () => {
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        const setHeader = vi.fn();

        await getLiveness(request, { status, setHeader });
        expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith({
            data: {
                status: "ok",
                check: "liveness",
            },
            meta: healthMeta,
        });
    });

    it("reports ready when Mongo is connected", async () => {
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        const setHeader = vi.fn();
        const getReadiness = createReadinessHandler({
            connection: { readyState: 1 },
        });

        await getReadiness(request, { status, setHeader });

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
        async (readyState) => {
            const json = vi.fn();
            const status = vi.fn(() => ({ json }));
            const setHeader = vi.fn();
            const getReadiness = createReadinessHandler({
                connection: { readyState },
            });

            await getReadiness(request, { status, setHeader });

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
