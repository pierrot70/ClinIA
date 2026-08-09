// Administrative configuration access does not imply access to every
// clinical dossier. Only SUPERADMIN retains the existing global scope until
// explicit clinic grants and an audited emergency-access flow are introduced.
const GLOBAL_CLINICAL_ACCESS_ROLES = new Set(["SUPERADMIN"]);

export function isPrivilegedUser(authUser) {
    return Boolean(
        authUser?.role && GLOBAL_CLINICAL_ACCESS_ROLES.has(authUser.role)
    );
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
