const PRIVILEGED_ROLES = new Set(["ADMIN", "SUPERADMIN"]);

export function isPrivilegedUser(authUser) {
    return Boolean(authUser?.role && PRIVILEGED_ROLES.has(authUser.role));
}

export function buildOwnerScope(authUser, field = "ownerUserId") {
    if (!authUser?.userId) {
        throw {
            code: "UNAUTHORIZED",
            message: "Authentification requise.",
        };
    }

    return isPrivilegedUser(authUser)
        ? {}
        : { [field]: authUser.userId };
}
