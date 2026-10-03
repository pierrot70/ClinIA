// A valid signature is insufficient: the token must belong to an active session.
// Keep the legacy single-session field supported, never an empty-list bypass.
export function hasCurrentAuthVersion(user, version) {
    const current = user?.authVersion ?? 0;
    const issued = version ?? 0;
    return Number.isSafeInteger(current) && Number.isSafeInteger(issued) &&
        current >= 0 && issued === current;
}

export function isTokenFromInactiveSession(user, payload) {
    if (!hasCurrentAuthVersion(user, payload?.av)) return true;
    const sid = payload?.sid;
    if (typeof sid !== "string" || !sid.trim()) return true;
    const active = Array.isArray(user?.activeSessionIds) ? user.activeSessionIds : [];
    return !active.includes(sid) && user?.activeSessionId !== sid;
}
