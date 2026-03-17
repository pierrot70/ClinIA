import type { UserRole } from "../auth/roles";

const API_URL = import.meta.env.VITE_API_URL as string;
const REFRESH_TOKEN_STORAGE_KEY = "clinia_refresh_token";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;

if (!API_URL) {
    throw new Error("VITE_API_URL is not defined");
}

export interface AuthUser {
    id?: string;
    email: string;
    role: UserRole;
}

export interface LoginCredentials {
    email: string;
    password: string;
    role?: UserRole;
}

export interface AuthSession {
    user: AuthUser;
    accessToken: string;
    refreshToken?: string;
}

export class SessionExpiredError extends Error {
    constructor(message = "Session expired") {
        super(message);
        this.name = "SessionExpiredError";
    }
}

type DecodedTokenPayload = {
    exp?: number;
    sub?: string;
    id?: string;
    userId?: string;
    email?: string;
    role?: string;
};

type LoginApiResponse = {
    data?: LoginApiResponse;
    meta?: Record<string, unknown>;
    accessToken?: string;
    token?: string;
    refreshToken?: string;
    user?: {
        id?: string;
        _id?: string;
        email?: string;
        username?: string;
        role?: string;
    };
    role?: string;
    email?: string;
    error?:
        | string
        | {
            code?: string;
            message?: string;
        };
    message?: string;
};

let inMemoryAccessToken: string | null = null;
let inMemoryUser: AuthUser | null = null;
let refreshPromise: Promise<string | null> | null = null;

function parseJwtPayload(token: string): DecodedTokenPayload | null {
    const parts = token.split(".");
    if (parts.length < 2) {
        return null;
    }

    try {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
        const json = atob(padded);
        return JSON.parse(json) as DecodedTokenPayload;
    } catch {
        return null;
    }
}

function isLikelyRole(value: unknown): value is UserRole {
    return value === "USER" || value === "MEDECIN" || value === "ADMIN" || value === "SUPERADMIN";
}

function isAccessTokenExpired(token: string): boolean {
    const payload = parseJwtPayload(token);
    if (!payload?.exp) {
        return false;
    }

    const expiresAt = payload.exp * 1000;
    return Date.now() >= expiresAt - ACCESS_TOKEN_REFRESH_SKEW_MS;
}

function getStoredRefreshToken(): string | null {
    try {
        return window.sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
}

function setStoredRefreshToken(token?: string): void {
    try {
        if (token) {
            window.sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
            return;
        }

        window.sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
        // Ignore storage errors.
    }
}

function mapUserFromPayload(
    response: LoginApiResponse,
    accessToken: string
): AuthUser | null {
    const payload = parseJwtPayload(accessToken);
    const roleCandidate = response.user?.role ?? response.role ?? payload?.role;

    if (!isLikelyRole(roleCandidate)) {
        return null;
    }

    return {
        id: response.user?.id ?? response.user?._id ?? payload?.id ?? payload?.userId ?? payload?.sub,
        email:
            response.user?.email ??
            response.email ??
            response.user?.username ??
            payload?.email ??
            "",
        role: roleCandidate,
    };
}

function applySession(session: AuthSession): void {
    inMemoryAccessToken = session.accessToken;
    inMemoryUser = session.user;

    setStoredRefreshToken(session.refreshToken);
}

function clearSession(): void {
    inMemoryAccessToken = null;
    inMemoryUser = null;
    refreshPromise = null;

    setStoredRefreshToken(undefined);
}

function redirectToLoginIfSessionWasForcedOut(user: AuthUser | null): void {
    if (!user || user.role === "SUPERADMIN") {
        return;
    }

    const currentPath = window.location.pathname;
    if (currentPath === "/login") {
        return;
    }

    window.location.replace("/login");
}

function getResponsePayload(data: LoginApiResponse): LoginApiResponse {
    if (data?.data && typeof data.data === "object") {
        return data.data;
    }

    return data;
}

function getErrorMessage(data: LoginApiResponse, fallback: string): string {
    const payload = getResponsePayload(data);

    if (typeof payload.error === "string" && payload.error.trim()) {
        return payload.error;
    }

    if (
        payload.error &&
        typeof payload.error === "object" &&
        typeof payload.error.message === "string" &&
        payload.error.message.trim()
    ) {
        return payload.error.message;
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
        return payload.message;
    }

    if (typeof data.message === "string" && data.message.trim()) {
        return data.message;
    }

    return fallback;
}

async function safeJson(response: Response): Promise<LoginApiResponse> {
    try {
        return (await response.json()) as LoginApiResponse;
    } catch {
        return {};
    }
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

function normalizeSessionFromResponse(data: LoginApiResponse): AuthSession {
    const payload = getResponsePayload(data);
    const accessToken = payload.accessToken ?? payload.token;
    if (!accessToken) {
        throw new Error("Authentication failed");
    }

    const user = mapUserFromPayload(payload, accessToken);
    if (!user) {
        throw new Error("Authentication failed");
    }

    return {
        user,
        accessToken,
        refreshToken: payload.refreshToken,
    };
}

async function loginWithAuthApi(credentials: LoginCredentials): Promise<AuthSession> {
    const response = await postJson("/api/auth/login", {
        email: credentials.email,
        password: credentials.password,
    });
    const data = await safeJson(response);

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Invalid credentials"));
    }

    return normalizeSessionFromResponse(data);
}

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
    const session = await loginWithAuthApi(credentials);
    applySession(session);
    return session;
}

export async function registerSelf(credentials: LoginCredentials): Promise<AuthSession> {
    const response = await postJson("/api/auth/register-self", {
        email: credentials.email,
        password: credentials.password,
        role: credentials.role,
    });
    const data = await safeJson(response);

    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Impossible de creer le compte"));
    }

    const session = await loginWithAuthApi(credentials);
    applySession(session);
    return session;
}

export async function logout(): Promise<void> {
    const refreshToken = getStoredRefreshToken();
    const token = inMemoryAccessToken;

    try {
        await postJson(
            "/api/auth/logout",
            refreshToken ? { refreshToken } : {},
            token ? { Authorization: `Bearer ${token}` } : {}
        );
    } catch {
        // Ignore network/logout errors to ensure local cleanup.
    } finally {
        clearSession();
    }
}

export async function refreshAccessToken(): Promise<string | null> {
    if (refreshPromise) {
        return refreshPromise;
    }

    const storedRefreshToken = getStoredRefreshToken();
    if (!storedRefreshToken) {
        const previousUser = inMemoryUser;
        clearSession();
        redirectToLoginIfSessionWasForcedOut(previousUser);
        return null;
    }

    refreshPromise = (async () => {
        try {
            const response = await postJson("/api/auth/refresh", {
                refreshToken: storedRefreshToken,
            });
            const data = await safeJson(response);
            const payload = getResponsePayload(data);

            if (!response.ok) {
                const previousUser = inMemoryUser;
                clearSession();
                redirectToLoginIfSessionWasForcedOut(previousUser);
                return null;
            }

            const session = normalizeSessionFromResponse({
                ...payload,
                refreshToken: payload.refreshToken ?? storedRefreshToken,
            });
            applySession(session);
            return session.accessToken;
        } catch {
            const previousUser = inMemoryUser;
            clearSession();
            redirectToLoginIfSessionWasForcedOut(previousUser);
            return null;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

export async function bootstrapSession(): Promise<AuthSession | null> {
    if (inMemoryAccessToken && inMemoryUser) {
        return {
            user: inMemoryUser,
            accessToken: inMemoryAccessToken,
            refreshToken: getStoredRefreshToken() ?? undefined,
        };
    }

    const accessToken = await refreshAccessToken();
    if (!accessToken || !inMemoryUser) {
        return null;
    }

    return {
        user: inMemoryUser,
        accessToken,
        refreshToken: getStoredRefreshToken() ?? undefined,
    };
}

export function getUser(): AuthUser | null {
    return inMemoryUser;
}

export function hasActiveSession(): boolean {
    return Boolean(inMemoryAccessToken && inMemoryUser);
}

export async function getValidAccessToken(): Promise<string | null> {
    if (!inMemoryAccessToken) {
        return refreshAccessToken();
    }

    if (isAccessTokenExpired(inMemoryAccessToken)) {
        return refreshAccessToken();
    }

    return inMemoryAccessToken;
}

type AuthFetchOptions = RequestInit & {
    retryOnUnauthorized?: boolean;
};

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
    if (typeof input === "string" && input.startsWith("/")) {
        return `${API_URL}${input}`;
    }

    if (input instanceof URL && input.origin === window.location.origin) {
        return new URL(`${API_URL}${input.pathname}${input.search}`);
    }

    return input;
}

export async function authFetch(input: RequestInfo | URL, init: AuthFetchOptions = {}) {
    const {
        retryOnUnauthorized = true,
        headers,
        ...rest
    } = init;

    const token = await getValidAccessToken();

    const requestHeaders = new Headers(headers);
    if (token) {
        requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    const requestTarget = resolveApiUrl(input);

    let response = await fetch(requestTarget, {
        ...rest,
        headers: requestHeaders,
    });

    if (response.status !== 401 || !retryOnUnauthorized) {
        return response;
    }

    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) {
        throw new SessionExpiredError();
    }

    requestHeaders.set("Authorization", `Bearer ${refreshedToken}`);
    response = await fetch(requestTarget, {
        ...rest,
        headers: requestHeaders,
    });

    if (response.status === 401) {
        const previousUser = inMemoryUser;
        clearSession();
        redirectToLoginIfSessionWasForcedOut(previousUser);
        throw new SessionExpiredError();
    }

    return response;
}
