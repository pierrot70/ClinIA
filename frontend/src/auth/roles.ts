export type UserRole = "USER" | "RECEPTION" | "MEDECIN" | "IPS" | "ADMIN" | "SUPERADMIN";

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

export function isClinicianRole(role: string | null | undefined): role is "MEDECIN" | "IPS" {
    return role === "MEDECIN" || role === "IPS";
}
