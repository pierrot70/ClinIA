export type UserRole = "USER" | "MEDECIN" | "ADMIN" | "SUPERADMIN";

export function isAdminRole(role: UserRole | null | undefined): boolean {
    return role === "ADMIN" || role === "SUPERADMIN";
}

export function getDefaultRouteForRole(role: UserRole): string {
    if (role === "ADMIN" || role === "SUPERADMIN") {
        return "/mock-studio";
    }

    return "/clinical";
}
