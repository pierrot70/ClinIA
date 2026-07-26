import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { registerSelf, refresh } = vi.hoisted(() => ({
    registerSelf: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock("../../services/auth.js", () => ({
    deleteUser: vi.fn(),
    login: vi.fn(),
    listActiveUsers: vi.fn(),
    listAuthLogGraphs: vi.fn(),
    listAuthLogs: vi.fn(),
    listUsers: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    registerSelf,
    reauthenticate: vi.fn(),
    resetUserPassword: vi.fn(),
    completeForcedPasswordChange: vi.fn(),
    refresh,
    setUserActiveStatus: vi.fn(),
    updateUser: vi.fn(),
}));

vi.mock("../../services/appShutdown.js", () => ({
    enforceScheduledShutdownIfDue: vi.fn(),
    forceClearMaintenanceState: vi.fn(),
    getAppShutdownState: vi.fn(() => ({})),
    isMaintenanceActive: vi.fn(() => false),
    scheduleAppShutdown: vi.fn(),
    clearMaintenanceState: vi.fn(),
}));

import router from "../auth.js";

function makeRes() {
    return {
        cookie: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

function getLastRouteHandler(method, path) {
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

describe("POST /register-self security", () => {
    const originalFlag = process.env.CLINIA_ALLOW_SELF_REGISTRATION;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.CLINIA_ALLOW_SELF_REGISTRATION;
    });

    afterEach(() => {
        if (originalFlag === undefined) {
            delete process.env.CLINIA_ALLOW_SELF_REGISTRATION;
        } else {
            process.env.CLINIA_ALLOW_SELF_REGISTRATION = originalFlag;
        }
    });

    it("is disabled by default", async () => {
        const handler = getLastRouteHandler("post", "/register-self");
        const req = {
            body: {
                email: "attacker@example.com",
                password: "password123",
                role: "SUPERADMIN",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(registerSelf).not.toHaveBeenCalled();
    });

    it("does not pass a client-supplied role when explicitly enabled", async () => {
        process.env.CLINIA_ALLOW_SELF_REGISTRATION = "true";
        registerSelf.mockResolvedValue({
            user: {
                id: "user-1",
                email: "attacker@example.com",
                role: "USER",
            },
        });

        const handler = getLastRouteHandler("post", "/register-self");
        const req = {
            body: {
                email: "attacker@example.com",
                password: "password123",
                role: "SUPERADMIN",
            },
        };
        const res = makeRes();

        await handler(req, res);

        expect(registerSelf).toHaveBeenCalledWith({
            email: "attacker@example.com",
            password: "password123",
            req,
        });
        expect(registerSelf.mock.calls[0][0]).not.toHaveProperty("role");
        expect(res.status).toHaveBeenCalledWith(201);
    });
});

describe("POST /refresh replay protection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 when a rotated refresh token is replayed", async () => {
        refresh.mockRejectedValue({
            code: "REFRESH_TOKEN_REUSED",
            message: "Session invalidee apres reutilisation d'un refresh token.",
        });
        const handler = getLastRouteHandler("post", "/refresh");
        const req = {
            body: { refreshToken: "a".repeat(64) },
            headers: {},
            cookies: {},
        };
        const res = makeRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "REFRESH_TOKEN_REUSED",
                message: "Session invalidee apres reutilisation d'un refresh token.",
                retryable: false,
            },
        });
    });
});
