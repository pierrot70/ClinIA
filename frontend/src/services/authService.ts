import type { UserRole } from "../auth/roles";
import { API_URL } from "./config";

const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;
const AUTH_SECURITY_NOTICE_STORAGE_KEY = "clinia.auth.security_notice";

export interface AuthUser {
    id?: string;
    email: string;
    role: UserRole;
    passwordResetRequired?: boolean;
    mustChangePasswordOnNextLogin?: boolean;
}

export interface LoginCredentials {
    email: string;
    password: string;
    role?: UserRole;
}

type BasicApiResponse = {
    error?: {
        code?: string;
        message?: string;
        restrictedUntil?: string;
        mfaLockedUntil?: string;
    };
    message?: string;
};

export type AuthSecurityNotice = {
    code:
        | "TOKEN_REVOKED"
        | "SESSION_REPLACED"
        | "ACCOUNT_TEMPORARILY_RESTRICTED"
        | "PASSWORD_CHANGE_REQUIRED";
    message: string;
    restrictedUntil?: string | null;
};

export interface AuthSession {
    user: AuthUser;
    accessToken: string;
}

export type MfaChallenge = {
    mfaChallenge: string;
    enrollmentRequired: boolean;
    manualEntryKey?: string;
    provisioningUri?: string;
};

export class MfaRequiredError extends Error {
    challenge: MfaChallenge;
    constructor(challenge: MfaChallenge) {
        super("MFA_REQUIRED");
        this.name = "MfaRequiredError";
        this.challenge = challenge;
    }
}

export class MfaVerificationError extends Error {
    code: string;
    mfaLockedUntil?: string;

    constructor(code: string, message: string, mfaLockedUntil?: string) {
        super(message);
        this.name = "MfaVerificationError";
        this.code = code;
        this.mfaLockedUntil = mfaLockedUntil;
    }
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
        passwordResetRequired?: boolean;
        mustChangePasswordOnNextLogin?: boolean;
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
    mfaRequired?: boolean;
    mfaEnrollmentRequired?: boolean;
    mfaChallenge?: string;
    manualEntryKey?: string;
    provisioningUri?: string;
    recoveryCodes?: unknown[];
};

let inMemoryAccessToken: string | null = null;
let inMemoryUser: AuthUser | null = null;
let refreshPromise: Promise<string | null> | null = null;
let diagnosticAccessTokenSnapshot: string | null = null;

function persistAuthSecurityNotice(notice: AuthSecurityNotice): void {
    try {
        window.sessionStorage.setItem(
            AUTH_SECURITY_NOTICE_STORAGE_KEY,
            JSON.stringify(notice)
        );
    } catch {
        // Ignore storage errors to avoid blocking auth UX.
    }
}

export function consumeAuthSecurityNotice(): AuthSecurityNotice | null {
    try {
        const raw = window.sessionStorage.getItem(AUTH_SECURITY_NOTICE_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        window.sessionStorage.removeItem(AUTH_SECURITY_NOTICE_STORAGE_KEY);
        const parsed = JSON.parse(raw) as AuthSecurityNotice | null;
        if (
            parsed?.code === "TOKEN_REVOKED" ||
            parsed?.code === "SESSION_REPLACED" ||
            parsed?.code === "ACCOUNT_TEMPORARILY_RESTRICTED" ||
            parsed?.code === "PASSWORD_CHANGE_REQUIRED"
        ) {
            return parsed;
        }
    } catch {
        // Ignore storage/parse issues and fall back to no notice.
    }

    return null;
}

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
        passwordResetRequired: response.user?.passwordResetRequired === true,
        mustChangePasswordOnNextLogin:
            response.user?.mustChangePasswordOnNextLogin === true,
    };
}

function applySession(session: AuthSession): void {
    inMemoryAccessToken = session.accessToken;
    inMemoryUser = session.user;
}

function clearSession({ clearDiagnosticToken = false } = {}): void {
    inMemoryAccessToken = null;
    inMemoryUser = null;
    refreshPromise = null;

    if (clearDiagnosticToken) {
        diagnosticAccessTokenSnapshot = null;
    }
}

function extractAuthSecurityNotice(
    payload: BasicApiResponse
): AuthSecurityNotice | null {
    const code = payload?.error?.code;

    if (
        code !== "TOKEN_REVOKED" &&
        code !== "SESSION_REPLACED" &&
        code !== "ACCOUNT_TEMPORARILY_RESTRICTED" &&
        code !== "PASSWORD_CHANGE_REQUIRED"
    ) {
        return null;
    }

    return {
        code,
        message:
            payload?.error?.message ||
            payload?.message ||
            "Votre session ClinIA a ete interrompue pour raison de securite.",
        restrictedUntil: payload?.error?.restrictedUntil || null,
    };
}

function redirectToLoginIfSessionWasForcedOut(
    user: AuthUser | null,
    notice: AuthSecurityNotice | null = null
): void {
    if (!user) {
        return;
    }

    if (notice) {
        persistAuthSecurityNotice(notice);
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

async function safeBasicJson(response: Response): Promise<BasicApiResponse> {
    try {
        return (await response.json()) as BasicApiResponse;
    } catch {
        return {};
    }
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${API_URL}${path}`, {
        method: "POST",
        credentials: "include",
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
    };
}

async function loginWithAuthApi(credentials: LoginCredentials): Promise<AuthSession> {
    const response = await postJson("/api/auth/login", {
        email: credentials.email,
        password: credentials.password,
    });
    const data = await safeJson(response);

    const payload = getResponsePayload(data);
    if (response.status === 202 && payload.mfaRequired === true && typeof payload.mfaChallenge === "string") {
        throw new MfaRequiredError({
            mfaChallenge: payload.mfaChallenge,
            enrollmentRequired: payload.mfaEnrollmentRequired === true,
            manualEntryKey: typeof payload.manualEntryKey === "string" ? payload.manualEntryKey : undefined,
            provisioningUri: typeof payload.provisioningUri === "string" ? payload.provisioningUri : undefined,
        });
    }
    if (!response.ok) {
        throw new Error(getErrorMessage(data, "Invalid credentials"));
    }

    return normalizeSessionFromResponse(data);
}

export async function completeMfaLogin(challenge: MfaChallenge, code: string): Promise<{ session: AuthSession; recoveryCodes: string[] }> {
    const response = await postJson("/api/auth/login/mfa", { mfaChallenge: challenge.mfaChallenge, code });
    const data = await safeJson(response);
    if (!response.ok) {
        const payload = getResponsePayload(data);
        const code =
            typeof payload.error === "object" && payload.error?.code
                ? payload.error.code
                : "MFA_VERIFICATION_FAILED";
        throw new MfaVerificationError(
            code,
            getErrorMessage(data, "Code MFA invalide."),
            typeof payload.error === "object" ? payload.error?.mfaLockedUntil : undefined
        );
    }
    const payload = getResponsePayload(data);
    const session = normalizeSessionFromResponse(data);
    applySession(session);
    return { session, recoveryCodes: Array.isArray(payload.recoveryCodes) ? payload.recoveryCodes.filter((value): value is string => typeof value === "string") : [] };
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

export async function requestPasswordRecovery(email: string): Promise<void> {
    const response = await postJson("/api/auth/password-recovery/request", {
        email,
    });
    const data = await safeBasicJson(response);

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
                data?.message ||
                "Impossible d'envoyer le code de verification."
        );
    }
}

export async function verifyPasswordRecoveryCode(
    email: string,
    code: string
): Promise<string> {
    const response = await postJson("/api/auth/password-recovery/verify", {
        email,
        code,
    });
    const data = await safeJson(response);
    const payload = getResponsePayload(data) as LoginApiResponse & {
        recoveryGrant?: string;
    };

    if (!response.ok || !payload.recoveryGrant) {
        throw new Error(
            getErrorMessage(data, "Le code est invalide ou expire.")
        );
    }

    return payload.recoveryGrant;
}

export async function completePasswordRecovery(
    email: string,
    recoveryGrant: string,
    newPassword: string
): Promise<void> {
    const response = await postJson("/api/auth/password-recovery/complete", {
        email,
        recoveryGrant,
        newPassword,
    });
    const data = await safeBasicJson(response);

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
                data?.message ||
                "Impossible de modifier le mot de passe."
        );
    }
}

export async function logout(): Promise<void> {
    const token = inMemoryAccessToken;

    try {
        await postJson(
            "/api/auth/logout",
            {},
            token ? { Authorization: `Bearer ${token}` } : {}
        );
    } catch {
        // Ignore network/logout errors to ensure local cleanup.
    } finally {
        clearSession({ clearDiagnosticToken: true });
    }
}

export async function reauthenticate(password: string): Promise<void> {
    const token = await getValidAccessToken();
    const response = await postJson(
        "/api/auth/reauth",
        { password },
        token ? { Authorization: `Bearer ${token}` } : {}
    );
    const data = await safeBasicJson(response);

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
                data?.message ||
                "Impossible de reconfirmer le mot de passe."
        );
    }
}

export async function refreshAccessToken(): Promise<string | null> {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const response = await postJson("/api/auth/refresh", {});
            const data = await safeJson(response);
            const payload = getResponsePayload(data);

            if (!response.ok) {
                const previousUser = inMemoryUser;
                const securityNotice = extractAuthSecurityNotice(data);
                clearSession();
                redirectToLoginIfSessionWasForcedOut(previousUser, securityNotice);
                return null;
            }

            const session = normalizeSessionFromResponse({
                ...payload,
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
        };
    }

    const accessToken = await refreshAccessToken();
    if (!accessToken || !inMemoryUser) {
        return null;
    }

    return {
        user: inMemoryUser,
        accessToken,
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
    skipTokenRefresh?: boolean;
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
        skipTokenRefresh = false,
        headers,
        ...rest
    } = init;

    let token = skipTokenRefresh ? (inMemoryAccessToken || diagnosticAccessTokenSnapshot) : await getValidAccessToken();

    if (skipTokenRefresh && inMemoryAccessToken) {
        diagnosticAccessTokenSnapshot = inMemoryAccessToken;
        token = inMemoryAccessToken;
    }

    const requestHeaders = new Headers(headers);
    if (token) {
        requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    const requestTarget = resolveApiUrl(input);

    let response = await fetch(requestTarget, {
        ...rest,
        credentials: "include",
        headers: requestHeaders,
    });

    if (response.status === 423) {
        const securityNotice = extractAuthSecurityNotice(
            await safeBasicJson(response.clone())
        );
        if (securityNotice) {
            persistAuthSecurityNotice(securityNotice);
        }
        return response;
    }

    if (response.status !== 401 || !retryOnUnauthorized) {
        return response;
    }

    const securityNotice = extractAuthSecurityNotice(
        await safeBasicJson(response.clone())
    );
    if (securityNotice) {
        persistAuthSecurityNotice(securityNotice);
    }

    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) {
        throw new SessionExpiredError();
    }

    requestHeaders.set("Authorization", `Bearer ${refreshedToken}`);
    response = await fetch(requestTarget, {
        ...rest,
        credentials: "include",
        headers: requestHeaders,
    });

    if (response.status === 401) {
        const previousUser = inMemoryUser;
        clearSession();
        redirectToLoginIfSessionWasForcedOut(previousUser, securityNotice);
        throw new SessionExpiredError();
    }

    return response;
}
