export const AUTH_ROLES = {
    MEDECIN: "MEDECIN",
    ADMIN: "ADMIN",
    SUPERADMIN: "SUPERADMIN",
};

export const AUTH_ROLE_VALUES = Object.values(AUTH_ROLES);

export const ACCESS_TOKEN_EXPIRES_IN = "15m";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;

export const REFRESH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const REFRESH_RATE_LIMIT_MAX_ATTEMPTS = 30;
