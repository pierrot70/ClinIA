export type UserRole = "USER" | "RECEPTION" | "MEDECIN" | "ADMIN" | "SUPERADMIN";

export function isAdminRole(role: UserRole | null | undefined): boolean {
    return role === "ADMIN" || role === "SUPERADMIN";
}

export function getDefaultRouteForRole(role: UserRole): string {
    if (role === "RECEPTION") {
        return "/walk-in-arrival";
    }
    if (role === "ADMIN" || role === "SUPERADMIN") {
        return "/mock-studio";
    }

    return "/clinical";
}
