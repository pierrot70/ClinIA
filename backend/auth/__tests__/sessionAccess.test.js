import { expect, it } from "vitest";
import { isTokenFromInactiveSession } from "../sessionAccess.js";

it("accepts a legacy token only while the account is still on generation zero", () => {
    const user = { activeSessionIds: ["session"] };
    expect(isTokenFromInactiveSession(user, { sid: "session" })).toBe(false);
    expect(isTokenFromInactiveSession({ ...user, authVersion: 1 }, { sid: "session" })).toBe(true);
});
it("refuses an old generation even if the old session id has been restored", () => {
    expect(isTokenFromInactiveSession({ activeSessionId: "old", authVersion: 2 }, { sid: "old", av: 1 })).toBe(true);
});
it("still requires active session membership for a current-generation token", () => {
    expect(isTokenFromInactiveSession({ activeSessionIds: ["current"], authVersion: 2 }, { sid: "current", av: 2 })).toBe(false);
    expect(isTokenFromInactiveSession({ activeSessionIds: [], authVersion: 2 }, { sid: "current", av: 2 })).toBe(true);
});
it.each([-1, 0.5, "1", Number.NaN, Number.POSITIVE_INFINITY])("rejects a malformed generation %s", av => {
    expect(isTokenFromInactiveSession({ activeSessionIds: ["session"], authVersion: 1 }, { sid: "session", av })).toBe(true);
});
