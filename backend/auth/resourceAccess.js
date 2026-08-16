export function isPrivilegedUser(authUser) {
    // A platform role is never, on its own, a clinical-data entitlement.
    // Delegated, read-only support grants will be evaluated separately and
    // scoped to their approved physician and patient records.
    void authUser;
    return false;
}

export function buildOwnerScope(authUser, field = "ownerUserId") {
    if (!authUser?.userId) {
        throw {
            code: "UNAUTHORIZED",
            message: "Authentification requise.",
        };
    }

    if (authUser.role === "SUPERADMIN") {
        throw {
            code: "CLINICAL_ACCESS_REQUIRED",
            message:
                "Une autorisation clinique déléguée en lecture est requise.",
        };
    }

    return isPrivilegedUser(authUser)
        ? {}
        : { [field]: authUser.userId };
}
