import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { requireRecentReauth } from "../requireRecentReauth.js";

afterEach(() => vi.unstubAllEnvs());

describe("session-bound sensitive reauthentication", () => {
    it.each(["expired", "wrong-user", "wrong-role", "wrong-audience", "wrong-purpose", "wrong-signature", "missing-cookie"])("continues to reject %s", kind => {
        const secret = randomBytes(32).toString("hex");
        vi.stubEnv("JWT_ACCESS_SECRET", secret);
        const token = jwt.sign({ purpose: kind === "wrong-purpose" ? "access" : "sensitive-reauth", role: kind === "wrong-role" ? "ADMIN" : "SUPERADMIN", sid: "session-a" },
            kind === "wrong-signature" ? randomBytes(32).toString("hex") : secret,
            { subject: kind === "wrong-user" ? "someone-else" : "synthetic-user", algorithm: "HS256", expiresIn: kind === "expired" ? -1 : 300,
                issuer: "clinia-backend", audience: kind === "wrong-audience" ? "clinia-app" : "clinia-sensitive-reauth" });
        const req = { headers: { cookie: kind === "missing-cookie" ? "" : `clinia_sensitive_reauth=${token}` },
            auth: { userId: "synthetic-user", role: "SUPERADMIN", sessionId: "session-a" } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
        requireRecentReauth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
    it.each([
        ["same session", "session-a", "session-a", true],
        ["another session of the same account", "session-a", "session-b", false],
        ["new session after logout", "session-a", "session-new", false],
        ["legacy cookie without sid", undefined, "session-a", false],
        ["missing authenticated session", "session-a", undefined, false],
        ["missing both identifiers", undefined, undefined, false],
    ])("%s", (_name, tokenSession, currentSession, accepted) => {
        const secret = randomBytes(32).toString("hex");
        vi.stubEnv("JWT_ACCESS_SECRET", secret);
        const token = jwt.sign({ purpose: "sensitive-reauth", role: "SUPERADMIN", ...(tokenSession ? { sid: tokenSession } : {}) }, secret,
            { subject: "synthetic-user", algorithm: "HS256", expiresIn: 300, issuer: "clinia-backend", audience: "clinia-sensitive-reauth" });
        const req = { headers: { cookie: `clinia_sensitive_reauth=${token}` }, auth: { userId: "synthetic-user", role: "SUPERADMIN", sessionId: currentSession } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
        requireRecentReauth(req, res, next);
        expect(next).toHaveBeenCalledTimes(accepted ? 1 : 0);
        if (!accepted) {
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: "REAUTH_REQUIRED" }) });
        }
    });
});
