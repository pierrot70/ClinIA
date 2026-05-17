export function createAuthError(code, message) {
    return { code, message };
}

export function assertSuperAdmin(authUser) {
    if (!authUser?.role || authUser.role !== "SUPERADMIN") {
        throw createAuthError(
            "FORBIDDEN",
            "Action reservee au SUPERADMIN."
        );
    }
}
