import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllMocks, saveAllMocks } = vi.hoisted(() => ({
    getAllMocks: vi.fn(),
    saveAllMocks: vi.fn(),
}));

vi.mock("../../utils/mockLoader.js", () => ({
    getAllMocks,
    saveAllMocks,
}));

import router from "../mocks.js";

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

    return layer.route.stack[0].handle;
}

describe("mocks routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns the full mock map", async () => {
        const handler = getRouteHandler("get", "/");
        const req = {};
        const res = makeRes();

        getAllMocks.mockReturnValue({
            migraine: { match: ["migraine"], patient_summary: "", treatments: [] },
        });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            migraine: { match: ["migraine"], patient_summary: "", treatments: [] },
        });
    });

    it("saves the full mock map", async () => {
        const handler = getRouteHandler("put", "/");
        const req = {
            body: {
                migraine: {
                    match: ["migraine"],
                    patient_summary: "",
                    treatments: [],
                },
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(saveAllMocks).toHaveBeenCalledWith(req.body);
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
