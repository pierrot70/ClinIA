import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthSession, LoginCredentials } from "../services/authService";
import {
    authFetch,
    bootstrapSession,
    getValidAccessToken,
    getUser,
    hasActiveSession,
    login as loginService,
    logout as logoutService,
    reauthenticate as reauthenticateService,
    registerSelf as registerSelfService,
    refreshAccessToken,
} from "../services/authService";
import type { UserRole } from "./roles";
import { labels } from "../i18n/uiLabels";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_WARNING_MS = 60 * 1000;
const SESSION_SERVER_TOUCH_MS = 60 * 1000;

interface AuthContextValue {
    status: AuthStatus;
    user: AuthSession["user"] | null;
    isAuthenticated: boolean;
    login: (credentials: LoginCredentials) => Promise<AuthSession>;
    registerSelf: (credentials: LoginCredentials) => Promise<AuthSession>;
    logout: () => Promise<void>;
    refreshSession: () => Promise<boolean>;
    reauthenticate: (password: string) => Promise<void>;
    authFetch: typeof authFetch;
    hasAnyRole: (roles: UserRole[]) => boolean;
    passwordResetRequired: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [status, setStatus] = useState<AuthStatus>("loading");
    const [user, setUser] = useState<AuthSession["user"] | null>(null);
    const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);
    const lastInteractionAtRef = useRef(Date.now());
    const lastServerTouchAtRef = useRef(0);

    const syncFromService = useCallback(() => {
        setUser(getUser());
        setStatus(hasActiveSession() ? "authenticated" : "unauthenticated");
    }, []);

    const syncSession = useCallback(async () => {
        const token = await getValidAccessToken();
        if (!token) {
            syncFromService();
            return false;
        }

        try {
            await authFetch("/api/auth/session");
            syncFromService();
            return true;
        } catch {
            syncFromService();
            return false;
        }
    }, [syncFromService]);

    const recordActivity = useCallback((forceServerTouch = false) => {
        if (status !== "authenticated") {
            return;
        }

        const now = Date.now();
        lastInteractionAtRef.current = now;
        setWarningSecondsLeft(null);

        if (
            forceServerTouch ||
            now - lastServerTouchAtRef.current >= SESSION_SERVER_TOUCH_MS
        ) {
            lastServerTouchAtRef.current = now;
            void syncSession();
        }
    }, [status, syncSession]);

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
                lastInteractionAtRef.current = Date.now();
                lastServerTouchAtRef.current = Date.now();
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
        if (status !== "authenticated") {
            setWarningSecondsLeft(null);
            return;
        }

        const activityEvents: Array<keyof WindowEventMap> = [
            "mousedown",
            "keydown",
            "touchstart",
        ];

        const onActivity = () => {
            recordActivity();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                recordActivity(true);
            }
        };

        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, onActivity, { passive: true });
        });
        window.addEventListener("focus", onActivity);
        document.addEventListener("visibilitychange", onVisibilityChange);

        const intervalId = window.setInterval(() => {
            const now = Date.now();
            const idleMs = now - lastInteractionAtRef.current;

            if (idleMs >= SESSION_IDLE_TIMEOUT_MS) {
                void logoutService().finally(() => {
                    setUser(null);
                    setStatus("unauthenticated");
                    setWarningSecondsLeft(null);
                });
                return;
            }

            const msBeforeExpiry = SESSION_IDLE_TIMEOUT_MS - idleMs;
            if (msBeforeExpiry <= SESSION_WARNING_MS) {
                setWarningSecondsLeft(Math.max(1, Math.ceil(msBeforeExpiry / 1000)));
            } else {
                setWarningSecondsLeft(null);
            }
        }, 1000);

        return () => {
            activityEvents.forEach((eventName) => {
                window.removeEventListener(eventName, onActivity);
            });
            window.removeEventListener("focus", onActivity);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.clearInterval(intervalId);
        };
    }, [recordActivity, status]);

    const login = useCallback(async (credentials: LoginCredentials) => {
        const session = await loginService(credentials);
        setUser(session.user);
        setStatus("authenticated");
        lastInteractionAtRef.current = Date.now();
        lastServerTouchAtRef.current = Date.now();
        return session;
    }, []);

    const registerSelf = useCallback(async (credentials: LoginCredentials) => {
        const session = await registerSelfService(credentials);
        setUser(session.user);
        setStatus("authenticated");
        lastInteractionAtRef.current = Date.now();
        lastServerTouchAtRef.current = Date.now();
        return session;
    }, []);

    const logout = useCallback(async () => {
        await logoutService();
        setUser(null);
        setStatus("unauthenticated");
        setWarningSecondsLeft(null);
    }, []);

    const refreshSession = useCallback(async () => {
        const token = await refreshAccessToken();
        syncFromService();
        return Boolean(token);
    }, [syncFromService]);

    const reauthenticate = useCallback(async (password: string) => {
        await reauthenticateService(password);
        recordActivity(true);
    }, [recordActivity]);

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
            reauthenticate,
            authFetch,
            hasAnyRole,
            passwordResetRequired: user?.passwordResetRequired === true,
        }),
        [
            status,
            user,
            login,
            registerSelf,
            logout,
            refreshSession,
            reauthenticate,
            hasAnyRole,
            user,
        ]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
            {status === "authenticated" && warningSecondsLeft !== null && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {labels.auth.session.warningTitle}
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            {labels.auth.session.warningBody}
                        </p>
                        <p className="mt-3 text-sm font-medium text-amber-700">
                            {warningSecondsLeft}s
                        </p>
                        <div className="mt-5 flex gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    recordActivity(true);
                                }}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                {labels.auth.session.warningContinue}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void logout();
                                }}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                {labels.auth.session.warningLogout}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthContext.Provider>
    );
};

export function useAuthContext() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}
