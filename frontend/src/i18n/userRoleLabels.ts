import { UI_LABELS_FR } from "./uiLabels.fr";

const roleSources = UI_LABELS_FR.auth.userManagement.roles;

// Translate display names only. API values and authorization checks keep their codes.
export function userRoleLabel(role: string, t: (source: string) => string): string {
    return Object.prototype.hasOwnProperty.call(roleSources, role)
        ? t(roleSources[role as keyof typeof roleSources])
        : role;
}
