import { describe, expect, it, vi } from "vitest";

import { registerErrorHandlers } from "../registerErrorHandlers.js";

describe("registerErrorHandlers", () => {
    it("returns a 403 JSON response for denied CORS origins", () => {
        const use = vi.fn();
        const app = { use };

        registerErrorHandlers(app);

        expect(use).toHaveBeenCalledTimes(1);
        const handler = use.mock.calls[0][0];

        const res = {
            status: vi.fn(),
            json: vi.fn(),
        };
        res.status.mockReturnValue(res);
        const next = vi.fn();

        handler({ code: "CORS_ORIGIN_DENIED" }, {}, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "CORS_ORIGIN_DENIED",
                message: "Origine CORS non autorisee.",
                retryable: false,
            },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("delegates unknown errors to next", () => {
        const use = vi.fn();
        const app = { use };

        registerErrorHandlers(app);

        const handler = use.mock.calls[0][0];
        const next = vi.fn();
        const res = {
            status: vi.fn(),
            json: vi.fn(),
        };

        const err = new Error("boom");
        handler(err, {}, res, next);

        expect(next).toHaveBeenCalledWith(err);
        expect(res.status).not.toHaveBeenCalled();
    });
});
