// A valid signature is insufficient: the token must belong to an active session.
// Keep the legacy single-session field supported, never an empty-list bypass.
export function isTokenFromInactiveSession(user, payload) {
    const sid = payload?.sid;
    if (typeof sid !== "string" || !sid.trim()) return true;
    const active = Array.isArray(user?.activeSessionIds) ? user.activeSessionIds : [];
    return !active.includes(sid) && user?.activeSessionId !== sid;
}
