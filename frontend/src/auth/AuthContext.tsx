import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthSession, LoginCredentials } from "../services/authService";
import {
    authFetch,
    bootstrapSession,
    getValidAccessToken,
    getUser,
    hasActiveSession,
    login as loginService,
    logout as logoutService,
    registerSelf as registerSelfService,
    refreshAccessToken,
} from "../services/authService";
import type { UserRole } from "./roles";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
    status: AuthStatus;
    user: AuthSession["user"] | null;
    isAuthenticated: boolean;
    login: (credentials: LoginCredentials) => Promise<AuthSession>;
    registerSelf: (credentials: LoginCredentials) => Promise<AuthSession>;
    logout: () => Promise<void>;
    refreshSession: () => Promise<boolean>;
    authFetch: typeof authFetch;
    hasAnyRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [status, setStatus] = useState<AuthStatus>("loading");
    const [user, setUser] = useState<AuthSession["user"] | null>(null);

    const syncFromService = useCallback(() => {
        setUser(getUser());
        setStatus(hasActiveSession() ? "authenticated" : "unauthenticated");
    }, []);

    useEffect(() => {
        let mounted = true;

        (async () => {
            const session = await bootstrapSession();
            if (!mounted) {
                return;
            }

            if (session) {
                setUser(session.user);
                setStatus("authenticated");
            } else {
                setUser(null);
                setStatus("unauthenticated");
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        let timerId: number | undefined;

        const syncSession = async () => {
            const token = await getValidAccessToken();
            if (!token) {
                if (!mounted) {
                    return;
                }
                syncFromService();
                return;
            }

            try {
                await authFetch("/api/auth/session");
            } catch {
                // authFetch already clears invalid sessions when necessary.
            }

            if (!mounted) {
                return;
            }
            syncFromService();
        };

        const scheduleNextSync = () => {
            timerId = window.setTimeout(async () => {
                await syncSession();
                scheduleNextSync();
            }, 30_000);
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void syncSession();
            }
        };

        void syncSession().finally(() => {
            if (mounted) {
                scheduleNextSync();
            }
        });

        window.addEventListener("focus", onVisibilityChange);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            mounted = false;
            if (timerId) {
                window.clearTimeout(timerId);
            }
            window.removeEventListener("focus", onVisibilityChange);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [syncFromService]);

    const login = useCallback(async (credentials: LoginCredentials) => {
        const session = await loginService(credentials);
        setUser(session.user);
        setStatus("authenticated");
        return session;
    }, []);

    const registerSelf = useCallback(async (credentials: LoginCredentials) => {
        const session = await registerSelfService(credentials);
        setUser(session.user);
        setStatus("authenticated");
        return session;
    }, []);

    const logout = useCallback(async () => {
        await logoutService();
        setUser(null);
        setStatus("unauthenticated");
    }, []);

    const refreshSession = useCallback(async () => {
        const token = await refreshAccessToken();
        syncFromService();
        return Boolean(token);
    }, [syncFromService]);

    const hasAnyRole = useCallback(
        (roles: UserRole[]) => {
            if (!user) {
                return false;
            }

            return roles.includes(user.role);
        },
        [user]
    );

    const value = useMemo<AuthContextValue>(
        () => ({
            status,
            user,
            isAuthenticated: status === "authenticated",
            login,
            registerSelf,
            logout,
            refreshSession,
            authFetch,
            hasAnyRole,
        }),
        [
            status,
            user,
            login,
            registerSelf,
            logout,
            refreshSession,
            hasAnyRole,
        ]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuthContext() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}
