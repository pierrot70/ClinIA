import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import VoiceNavButton from "./VoiceNavButton";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { useAuth } from "../hooks/useAuth";
import { isAdminRole } from "../auth/roles";
import { SessionExpiredError } from "../services/authService";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

type ActiveUser = {
    id: string;
    username: string;
    email: string | null;
    role: string;
    isActive: boolean;
    lastLoginAt?: string | null;
};

type AuthLogEntry = {
    id: string;
    action: string;
    outcome: string;
    userId: string | null;
    usernameMasked: string;
    role: string | null;
    ip: string | null;
    reason: string | null;
    timestamp: string;
};

type AuthLogPagination = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

type AuthGraphPoint = {
    date: string;
    total: number;
    [key: string]: string | number;
};

type DateRangeSnapshot = {
    startDate: string;
    endDate: string;
};

type AuthGraphType = "xy" | "pie" | "histogram";

type AuthGraphTooltipProps = {
    active?: boolean;
    payload?: Array<{ payload?: AuthGraphPoint; value?: number }>;
    label?: string;
    onOpenLogsForDate: (date: string) => void;
};

type AuthHistogramTooltipProps = {
    active?: boolean;
    payload?: Array<{ payload?: AuthGraphPoint; value?: number }>;
    label?: string;
    actionNames: string[];
    onOpenLogsForDateAndAction: (date: string, actionName?: string) => void;
};

const AuthGraphTooltip: React.FC<AuthGraphTooltipProps> = ({
    active,
    payload,
    label,
    onOpenLogsForDate,
}) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const point = payload[0]?.payload;
    const date = point?.date || label;
    const countFromPayload = payload.reduce((sum, item) => {
        return sum + (typeof item?.value === "number" ? item.value : 0);
    }, 0);
    const count = typeof point?.total === "number" ? point.total : countFromPayload;

    if (!date) {
        return null;
    }

    return (
        <div className="rounded border border-gray-200 bg-white p-2 text-xs shadow">
            <div className="text-gray-700">Date: {date}</div>
            <div className="text-gray-700">Logs: {count ?? 0}</div>
            <button
                type="button"
                onClick={() => onOpenLogsForDate(date)}
                className="mt-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
            >
                Ouvrir logs
            </button>
        </div>
    );
};

const AuthHistogramTooltip: React.FC<AuthHistogramTooltipProps> = ({
    active,
    payload,
    label,
    actionNames,
    onOpenLogsForDateAndAction,
}) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const point = payload[0]?.payload;
    const date = point?.date || label;
    if (!date) {
        return null;
    }

    const total = typeof point?.total === "number" ? point.total : 0;

    return (
        <div className="max-w-[260px] rounded border border-gray-200 bg-white p-2 text-xs shadow">
            <div className="mb-1 text-gray-700">Date: {date}</div>
            <div className="mb-2 text-gray-700">Total logs: {total}</div>
            <div className="space-y-1">
                <button
                    type="button"
                    onClick={() => onOpenLogsForDateAndAction(date)}
                    className="block w-full rounded bg-blue-50 px-2 py-1 text-left text-xs text-blue-700 hover:bg-blue-100"
                >
                    Tous
                </button>
                {actionNames.map((actionName) => {
                    const value = point?.[actionName];
                    const count = typeof value === "number" ? value : 0;
                    if (count <= 0) {
                        return null;
                    }

                    return (
                        <button
                            key={actionName}
                            type="button"
                            onClick={() => onOpenLogsForDateAndAction(date, actionName)}
                            className="block w-full rounded bg-gray-50 px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100"
                        >
                            {actionName} ({count})
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const AUTH_LOG_ACTION_OPTIONS = [
    { value: "", label: "Toutes" },
    { value: "LOGIN", label: "LOGIN" },
    { value: "LOGOUT", label: "LOGOUT" },
    { value: "FAILED_LOGIN", label: "FAILED_LOGIN" },
    { value: "USER_MANAGEMENT", label: "USER_MANAGEMENT" },
];

const AUTH_GRAPH_ACTION_COLORS = {
    LOGIN: "#2563eb",
    LOGOUT: "#16a34a",
    FAILED_LOGIN: "#dc2626",
    USER_MANAGEMENT: "#d97706",
};

const AUTH_GRAPH_TYPE_LABELS: Record<AuthGraphType, string> = {
    xy: "x-y graph",
    pie: "Pie graph",
    histogram: "Histogramme graph",
};

const Header: React.FC = () => {
    const now = new Date();
    const todayDateValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const location = useLocation();
    const { locale, setLocaleFromDropdown, isTranslating } = useHomeI18n();
    const {
        isAuthenticated,
        user,
        logout: logoutSession,
        authFetch,
    } = useAuth();
    const FORCE_REAL_STORAGE_KEY = "clinia_force_real";
    const canAccessAdmin = isAuthenticated && isAdminRole(user?.role);
    const isProd = !!import.meta.env.PROD;
    const isDev = !isProd;
    const hostname = window.location.hostname;
    const isLocalRuntime =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";
    const isRemoteProd = isProd && !isLocalRuntime;
    const [showActiveUsersModal, setShowActiveUsersModal] = useState(false);
    const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
    const [loadingActiveUsers, setLoadingActiveUsers] = useState(false);
    const [activeUsersError, setActiveUsersError] = useState<string | null>(null);
    const [showAuthLogsModal, setShowAuthLogsModal] = useState(false);
    const [showAuthGraphsModal, setShowAuthGraphsModal] = useState(false);
    const [authGraphType, setAuthGraphType] = useState<AuthGraphType>("xy");
    const [authLogs, setAuthLogs] = useState<AuthLogEntry[]>([]);
    const [loadingAuthLogs, setLoadingAuthLogs] = useState(false);
    const [authLogsError, setAuthLogsError] = useState<string | null>(null);
    const [authLogsQueryDurationMs, setAuthLogsQueryDurationMs] = useState<number | null>(null);
    const [authLogStartDate, setAuthLogStartDate] = useState(todayDateValue);
    const [authLogEndDate, setAuthLogEndDate] = useState(todayDateValue);
    const [authLogAction, setAuthLogAction] = useState("");
    const [authGraphAction, setAuthGraphAction] = useState("");
    const [authLogPage, setAuthLogPage] = useState(1);
    const [authGraphPoints, setAuthGraphPoints] = useState<AuthGraphPoint[]>([]);
    const [authGraphActions, setAuthGraphActions] = useState<string[]>([]);
    const [loadingAuthGraphs, setLoadingAuthGraphs] = useState(false);
    const [authGraphsError, setAuthGraphsError] = useState<string | null>(null);
    const [authGraphsDateSnapshot, setAuthGraphsDateSnapshot] = useState<DateRangeSnapshot | null>(null);
    const [authLogPagination, setAuthLogPagination] = useState<AuthLogPagination>({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
    });
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const ACTIVE_USERS_REFRESH_MS = 5_000;

    const logout = () => {
        logoutSession().finally(() => {
            window.location.href = isRemoteProd ? "/login" : "/";
        });
    };

    const [forceReal, setForceReal] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(FORCE_REAL_STORAGE_KEY);
        setForceReal(stored === "true");

        const handleChange = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail && typeof detail.forceReal === "boolean") {
                setForceReal(detail.forceReal);
            }
        };
        window.addEventListener("clinia:force-real-changed", handleChange);
        return () => {
            window.removeEventListener("clinia:force-real-changed", handleChange);
        };
    }, []);

    const linkClass = (path: string) =>
        "hover:text-primary transition-colors " +
        (location.pathname === path
            ? "text-primary font-medium"
            : "text-gray-600");

    const clinicNavPaths = [
        "/appointments",
        "/patients",
        "/cliniques",
        "/specialists",
    ];

    const isClinicGroupActive = clinicNavPaths.some((path) =>
        location.pathname.startsWith(path)
    );

    const languageOptions = [
        { value: "fr-CA", label: "Français (Canada)" },
        { value: "en-CA", label: "English (Canada)" },
        { value: "ko-KR", label: "한국어 (대한민국)" },
        { value: "vi", label: "Tiếng Việt" },
        { value: "ja", label: "日本語" },
        { value: "zh", label: "中文（普通话）" },
        { value: "he", label: "עברית" },
        { value: "es", label: "Español" },
    ];

    const onLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextLocale = event.target.value;
        setLocaleFromDropdown(nextLocale).catch(() => {
            // Keep current locale if translation request fails.
        });
    };

    const toggleForceReal = () => {
        const next = !forceReal;
        setForceReal(next);
        localStorage.setItem(FORCE_REAL_STORAGE_KEY, String(next));
        window.dispatchEvent(
            new CustomEvent("clinia:force-real-changed", {
                detail: { forceReal: next },
            })
        );
    };

    const triggerAppShutdown = async () => {
        const confirmed = window.confirm(
            "Activer l'arret de l'application dans 30 secondes ? Tous les utilisateurs (sauf SUPERADMIN) seront deconnectes."
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await authFetch("/api/auth/app-shutdown", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ delaySeconds: 30 }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                window.alert(
                    payload?.error?.message ||
                        "Impossible de planifier l'arret de l'application."
                );
                return;
            }

            window.alert(
                "Arret de l'application planifie dans 30 secondes pour les utilisateurs non SUPERADMIN."
            );
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }
            window.alert("Erreur reseau lors de la planification de l'arret.");
        }
    };

    const clearMaintenance = async () => {
        const confirmed = window.confirm(
            "Terminer la maintenance ? L'application sera accessible a tous les utilisateurs."
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await authFetch("/api/auth/app-shutdown/clear", {
                method: "POST",
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                window.alert(
                    payload?.error?.message ||
                        "Impossible de terminer la maintenance."
                );
                return;
            }

            window.alert("Maintenance terminee. L'application est de nouveau accessible.");
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }
            window.alert("Erreur reseau lors de la fin de maintenance.");
        }
    };

    const forceReopenMaintenance = async () => {
        const confirmed = window.confirm(
            "Forcer la reouverture normale maintenant ? Cette action est de secours si Mongo ne sauvegarde pas correctement."
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await authFetch("/api/auth/app-shutdown/force-reopen", {
                method: "POST",
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                window.alert(
                    payload?.error?.message ||
                        "Impossible de forcer la reouverture."
                );
                return;
            }

            if (payload?.data?.persisted === false) {
                window.alert(
                    "Reouverture forcee activee. Attention: la sauvegarde Mongo a echoue, verifier l'etat de la base."
                );
                return;
            }

            window.alert("Reouverture forcee appliquee. L'application est accessible.");
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }
            window.alert("Erreur reseau lors de la reouverture forcee.");
        }
    };

    const loadActiveUsers = async (showLoadingState = false) => {
        if (showLoadingState) {
            setLoadingActiveUsers(true);
        }
        setActiveUsersError(null);

        try {
            const response = await authFetch("/api/auth/users/active");
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                setActiveUsersError(
                    payload?.error?.message ||
                        "Impossible de charger les usagers actifs."
                );
                setActiveUsers([]);
                return;
            }

            setActiveUsers(payload?.data?.users || []);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }

            setActiveUsersError("Erreur reseau lors du chargement des usagers actifs.");
            setActiveUsers([]);
        } finally {
            if (showLoadingState) {
                setLoadingActiveUsers(false);
            }
        }
    };

    const openActiveUsersModal = async () => {
        setShowActiveUsersModal(true);
        await loadActiveUsers(true);
    };

    const loadAuthLogs = async (targetPage = 1, showLoadingState = true) => {
        const requestStartedAt = performance.now();
        if (showLoadingState) {
            setLoadingAuthLogs(true);
        }
        setAuthLogsError(null);

        if (authLogStartDate && authLogEndDate && authLogStartDate > authLogEndDate) {
            setAuthLogsError("Date debut ne peut pas etre plus grande que Date fin.");
            setAuthLogs([]);
            setAuthLogsQueryDurationMs(null);
            if (showLoadingState) {
                setLoadingAuthLogs(false);
            }
            return;
        }

        try {
            const query = new URLSearchParams({
                page: String(targetPage),
                limit: "10",
            });

            if (authLogStartDate) {
                query.set("startDate", authLogStartDate);
            }
            if (authLogEndDate) {
                query.set("endDate", authLogEndDate);
            }
            if (authLogAction.trim()) {
                query.set("action", authLogAction.trim());
            }

            const response = await authFetch(`/api/auth/auth-logs?${query.toString()}`);
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                setAuthLogsError(
                    payload?.error?.message ||
                        "Impossible de charger les logs d'authentification."
                );
                setAuthLogs([]);
                setAuthLogsQueryDurationMs(Math.round(performance.now() - requestStartedAt));
                return;
            }

            const logs = payload?.data?.logs || [];
            const pagination = payload?.data?.pagination || {
                page: targetPage,
                limit: 10,
                total: logs.length,
                totalPages: 1,
            };

            setAuthLogs(logs);
            setAuthLogPagination(pagination);
            setAuthLogPage(pagination.page || targetPage);
            setAuthLogsQueryDurationMs(Math.round(performance.now() - requestStartedAt));
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }

            setAuthLogsError("Erreur reseau lors du chargement des logs auth.");
            setAuthLogs([]);
            setAuthLogsQueryDurationMs(Math.round(performance.now() - requestStartedAt));
        } finally {
            if (showLoadingState) {
                setLoadingAuthLogs(false);
            }
        }
    };

    const openAuthLogsModal = () => {
        setShowAuthLogsModal(true);
    };

    const openAuthLogsForDate = (date: string) => {
        setAuthGraphsDateSnapshot({
            startDate: authLogStartDate,
            endDate: authLogEndDate,
        });
        setAuthLogStartDate(date);
        setAuthLogEndDate(date);
        setAuthLogAction("");
        setShowAuthLogsModal(true);
    };

    const openAuthLogsForDateAndAction = (date: string, actionName?: string) => {
        setAuthGraphsDateSnapshot({
            startDate: authLogStartDate,
            endDate: authLogEndDate,
        });
        setAuthLogStartDate(date);
        setAuthLogEndDate(date);
        setAuthLogAction(actionName || "");
        setShowAuthLogsModal(true);
    };

    const openAuthLogsForRangeAndAction = (actionName: string) => {
        setAuthGraphsDateSnapshot({
            startDate: authLogStartDate,
            endDate: authLogEndDate,
        });
        setAuthLogAction(actionName);
        setShowAuthLogsModal(true);
    };

    const loadAuthGraphs = async () => {
        if (authLogStartDate && authLogEndDate && authLogStartDate > authLogEndDate) {
            setAuthGraphsError("Date debut ne peut pas etre plus grande que Date fin.");
            setAuthGraphPoints([]);
            return;
        }

        setLoadingAuthGraphs(true);
        setAuthGraphsError(null);

        try {
            const query = new URLSearchParams();
            if (authLogStartDate) {
                query.set("startDate", authLogStartDate);
            }
            if (authLogEndDate) {
                query.set("endDate", authLogEndDate);
            }
            if (authGraphAction.trim()) {
                query.set("action", authGraphAction.trim());
            }

            query.set("graph", "true");

            const response = await authFetch(`/api/auth/auth-logs?${query.toString()}`);
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                setAuthGraphsError(
                    payload?.error?.message ||
                        "Impossible de charger le graphique des logs auth."
                );
                setAuthGraphPoints([]);
                setAuthGraphActions([]);
                return;
            }

            const points = payload?.data?.points || [];
            const actionsFromApi = payload?.data?.actions || [];
            const inferredActions =
                points.length > 0
                    ? Object.keys(points[0]).filter(
                        (key) => key !== "date" && key !== "total"
                    )
                    : [];
            setAuthGraphPoints(points);
            setAuthGraphActions(actionsFromApi.length > 0 ? actionsFromApi : inferredActions);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }

            setAuthGraphsError("Erreur reseau lors du chargement du graphique auth.");
            setAuthGraphPoints([]);
            setAuthGraphActions([]);
        } finally {
            setLoadingAuthGraphs(false);
        }
    };

    const openAuthGraphsModal = (type: AuthGraphType) => {
        setAuthGraphType(type);
        setAuthGraphAction("");
        setShowAuthGraphsModal(true);
    };

    const closeAuthGraphsModal = () => {
        setShowAuthGraphsModal(false);
        setAuthGraphsError(null);
    };

    const authGraphPieData = useMemo(() => {
        if (authGraphActions.length === 0) {
            return [];
        }

        return authGraphActions
            .map((actionName) => {
                const total = authGraphPoints.reduce((sum, point) => {
                    const value = point[actionName];
                    return sum + (typeof value === "number" ? value : 0);
                }, 0);

                return {
                    action: actionName,
                    value: total,
                };
            })
            .filter((entry) => entry.value > 0);
    }, [authGraphActions, authGraphPoints]);

    const applyAuthLogFilters = async () => {
        await loadAuthLogs(1, true);
    };

    const closeAuthLogsModal = () => {
        setShowAuthLogsModal(false);
        setAuthLogsError(null);

        if (showAuthGraphsModal && authGraphsDateSnapshot) {
            setAuthLogStartDate(authGraphsDateSnapshot.startDate);
            setAuthLogEndDate(authGraphsDateSnapshot.endDate);
            setAuthGraphsDateSnapshot(null);
        }
    };

    const formatAuthLogTimestamp = (value: string) => {
        if (!value) {
            return "Inconnu";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "Invalide";
        }
        return date.toLocaleString();
    };

    useEffect(() => {
        if (!showActiveUsersModal) {
            return;
        }

        const intervalId = window.setInterval(() => {
            void loadActiveUsers(false);
        }, ACTIVE_USERS_REFRESH_MS);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [showActiveUsersModal]);

    useEffect(() => {
        if (!showAuthLogsModal) {
            return;
        }

        void loadAuthLogs(1, true);
    }, [showAuthLogsModal, authLogStartDate, authLogEndDate, authLogAction]);

    useEffect(() => {
        if (!showAuthGraphsModal) {
            return;
        }

        void loadAuthGraphs();
    }, [showAuthGraphsModal, authLogStartDate, authLogEndDate, authGraphAction]);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <header className="bg-white border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 py-3">
                <div className="grid grid-cols-3 items-center lg:hidden">
                    <Link to="/" className="justify-self-start text-lg font-semibold leading-tight text-gray-900">
                        ClinIA
                    </Link>

                    <div className="justify-self-center">
                        <VoiceNavButton />
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                        className="justify-self-end rounded border border-gray-300 px-3 py-1 text-sm text-gray-700"
                        aria-label="Ouvrir le menu"
                    >
                        {isMobileMenuOpen ? "Fermer" : "Menu"}
                    </button>
                </div>

                <div className="hidden items-center justify-between gap-3 lg:flex">
                    <Link to="/" className="flex min-w-0 items-center gap-3">
                        <img
                            src="/logo.png"
                            alt="ClinIA logo"
                            className="h-10 w-auto"
                        />
                        <div className="min-w-0">
                            <div className="truncate font-semibold text-lg leading-tight">
                                ClinIA
                            </div>
                            <div className="text-xs text-gray-500">
                                Assistant clinique IA – Prototype
                            </div>
                        </div>
                    </Link>

                    <div className="flex items-center gap-2">
                        {isDev && (
                            <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 border border-blue-300">
                                DEV – Docker
                            </span>
                        )}
                        {isProd && (
                            <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 border border-green-300">
                                {isLocalRuntime ? "PROD - LOCAL" : "PROD - REMOTE"}
                            </span>
                        )}
                        {isDev && (
                            <button
                                type="button"
                                onClick={toggleForceReal}
                                className={
                                    "px-2 py-1 text-xs rounded border transition " +
                                    (forceReal
                                        ? "bg-red-600 text-white border-red-600"
                                        : "bg-gray-100 text-gray-700 border-gray-300")
                                }
                                title={
                                    forceReal
                                        ? "Forcer IA réelle"
                                        : "Utiliser le mode mock"
                                }
                            >
                                {forceReal ? "IA réelle" : "IA mock"}
                            </button>
                        )}
                    </div>
                </div>

                <nav className="mt-3 hidden items-center gap-4 text-sm lg:flex">
                    <VoiceNavButton />

                    <label className="flex items-center gap-2 text-gray-600">
                        <span className="text-xs">Langue</span>
                        <select
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                            value={locale}
                            onChange={onLanguageChange}
                            disabled={isTranslating}
                            aria-label="Choisir la langue"
                        >
                            {languageOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <Link to="/" className={linkClass("/")}>
                        Accueil
                    </Link>

                    <Link to="/clinical" className={linkClass("/clinical")}>
                        Analyse clinique
                    </Link>

                    <div className="relative group">
                        <button
                            type="button"
                            className={
                                "flex items-center gap-1 rounded px-3 py-1 text-sm transition " +
                                (isClinicGroupActive
                                    ? "text-primary font-medium"
                                    : "text-gray-600 hover:text-primary")
                            }
                        >
                        Gestion clinique
                            <span className="text-xs">▾</span>
                        </button>
                        <div className="absolute right-0 top-full z-10 mt-2 hidden min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg transition group-hover:block group-focus-within:block">
                                {[
                                    {
                                        label: "Rendez-vous",
                                        path: "/appointments",
                                    },
                                    {
                                        label: "Patients",
                                        path: "/patients",
                                    },
                                    {
                                        label: "Cliniques",
                                        path: "/cliniques",
                                    },
                                    {
                                        label: "Spécialistes",
                                        path: "/specialists",
                                    },
                                ].map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={
                                        "block px-4 py-2 text-sm transition hover:bg-gray-50 " +
                                        (location.pathname === item.path
                                            ? "text-primary font-medium"
                                            : "text-gray-700")
                                    }
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {user?.role === "SUPERADMIN" && (
                        <div className="relative group">
                            <button
                                type="button"
                                className="flex items-center gap-1 rounded px-3 py-1 text-sm text-gray-600 transition hover:text-primary"
                            >
                                Gestion Application
                                <span className="text-xs">▾</span>
                            </button>
                            <div className="absolute right-0 top-full z-10 mt-2 hidden min-w-[220px] rounded-lg border border-gray-200 bg-white shadow-lg transition group-hover:block group-focus-within:block">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void openActiveUsersModal();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                >
                                    Montrer Usager Actif
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void openAuthLogsModal();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                >
                                    Montrer Auth Log
                                </button>
                                <details className="group/graphs border-t border-gray-100">
                                    <summary className="cursor-pointer list-none px-4 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50">
                                        Graphiques Auth
                                    </summary>
                                    <div className="space-y-1 pb-2 pl-4 pr-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                openAuthGraphsModal("xy");
                                            }}
                                            className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                        >
                                            x-y graph
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                openAuthGraphsModal("pie");
                                            }}
                                            className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                        >
                                            Pie graph
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                openAuthGraphsModal("histogram");
                                            }}
                                            className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                        >
                                            Histogramme graph
                                        </button>
                                    </div>
                                </details>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void triggerAppShutdown();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-red-700 transition hover:bg-red-50"
                                >
                                    Arret de l'application
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void clearMaintenance();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-green-700 transition hover:bg-green-50"
                                >
                                    Fin de maintenance
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void forceReopenMaintenance();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-emerald-800 transition hover:bg-emerald-50"
                                >
                                    Forcer reouverture normale
                                </button>
                            </div>
                        </div>
                    )}

                    <Link to="/quick" className={linkClass("/quick")}>
                        Mode rapide
                    </Link>

                    <Link
                        to="/patient-summary"
                        className={linkClass("/patient-summary")}
                    >
                        Résumé patient
                    </Link>

                    {/* ---------- ADMIN ---------- */}
                    {!isAuthenticated && (
                        <Link
                            to="/login"
                            className={
                                "hover:text-primary transition-colors " +
                                (location.pathname === "/login"
                                    ? "text-primary font-medium"
                                    : "text-gray-600")
                            }
                        >
                            Connexion
                        </Link>
                    )}

                    {!canAccessAdmin && (
                        <Link
                            to="/admin/login"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname.startsWith("/admin")
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            Admin
                        </Link>
                    )}

                    {canAccessAdmin && (
                        <Link
                            to="/mock-studio"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname === "/mock-studio"
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            Mock Studio
                        </Link>
                    )}

                    {canAccessAdmin && user?.role === "SUPERADMIN" && (
                        <Link
                            to="/admin/users/manage"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname === "/admin/users/manage"
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            Utilisateurs
                        </Link>
                    )}

                    {canAccessAdmin && (
                        <button
                            onClick={logout}
                            className="text-sm text-red-600 hover:text-red-700 ml-3"
                        >
                            Déconnexion
                        </button>
                    )}
                </nav>

                {isMobileMenuOpen && (
                    <div className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-white p-3 lg:hidden">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                {isDev && (
                                    <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 border border-blue-300">
                                        DEV
                                    </span>
                                )}
                                {isProd && (
                                    <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 border border-green-300">
                                        {isLocalRuntime ? "PROD - LOCAL" : "PROD - REMOTE"}
                                    </span>
                                )}
                            </div>
                            {isDev && (
                                <button
                                    type="button"
                                    onClick={toggleForceReal}
                                    className={
                                        "px-2 py-1 text-xs rounded border transition " +
                                        (forceReal
                                            ? "bg-red-600 text-white border-red-600"
                                            : "bg-gray-100 text-gray-700 border-gray-300")
                                    }
                                >
                                    {forceReal ? "IA réelle" : "IA mock"}
                                </button>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <VoiceNavButton />
                            <label className="flex items-center gap-2 text-gray-600">
                                <span className="text-xs">Langue</span>
                                <select
                                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                                    value={locale}
                                    onChange={onLanguageChange}
                                    disabled={isTranslating}
                                    aria-label="Choisir la langue"
                                >
                                    {languageOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="space-y-1 border-t border-gray-100 pt-2">
                            <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Accueil</Link>
                            <Link to="/clinical" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Analyse clinique</Link>
                            <Link to="/appointments" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Rendez-vous</Link>
                            <Link to="/patients" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Patients</Link>
                            <Link to="/cliniques" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Cliniques</Link>
                            <Link to="/specialists" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Spécialistes</Link>
                            <Link to="/quick" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Mode rapide</Link>
                            <Link to="/patient-summary" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Résumé patient</Link>
                        </div>

                        {user?.role === "SUPERADMIN" && (
                            <div className="space-y-1 border-t border-gray-100 pt-2">
                                <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Gestion Application</div>
                                <button type="button" onClick={() => { void openActiveUsersModal(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Montrer Usager Actif</button>
                                <button type="button" onClick={() => { void openAuthLogsModal(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Montrer Auth Log</button>
                                <details>
                                    <summary className="cursor-pointer rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Graphiques Auth</summary>
                                    <div className="mt-1 space-y-1 pl-2">
                                        <button type="button" onClick={() => { openAuthGraphsModal("xy"); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">x-y graph</button>
                                        <button type="button" onClick={() => { openAuthGraphsModal("pie"); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Pie graph</button>
                                        <button type="button" onClick={() => { openAuthGraphsModal("histogram"); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">Histogramme graph</button>
                                    </div>
                                </details>
                                <button type="button" onClick={() => { void triggerAppShutdown(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50">Arret de l'application</button>
                                <button type="button" onClick={() => { void clearMaintenance(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-green-700 hover:bg-green-50">Fin de maintenance</button>
                                <button type="button" onClick={() => { void forceReopenMaintenance(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-emerald-800 hover:bg-emerald-50">Forcer reouverture normale</button>
                            </div>
                        )}

                        <div className="space-y-1 border-t border-gray-100 pt-2">
                            {!isAuthenticated && (
                                <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Connexion</Link>
                            )}

                            {!canAccessAdmin && (
                                <Link to="/admin/login" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Admin</Link>
                            )}

                            {canAccessAdmin && (
                                <Link to="/mock-studio" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Mock Studio</Link>
                            )}

                            {canAccessAdmin && user?.role === "SUPERADMIN" && (
                                <Link to="/admin/users/manage" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">Utilisateurs</Link>
                            )}

                            {canAccessAdmin && (
                                <button
                                    onClick={logout}
                                    className="block w-full rounded px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                    Déconnexion
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {showActiveUsersModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <h2 className="text-lg font-semibold text-gray-900">
                                Usagers actifs
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void loadActiveUsers(true);
                                    }}
                                    className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                                >
                                    Rafraichir
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowActiveUsersModal(false)}
                                    className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>

                        {loadingActiveUsers ? (
                            <p className="text-sm text-gray-500">Chargement des usagers actifs...</p>
                        ) : activeUsersError ? (
                            <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                                {activeUsersError}
                            </div>
                        ) : activeUsers.length === 0 ? (
                            <p className="text-sm text-gray-500">Aucun usager actif.</p>
                        ) : (
                            <div className="max-h-[360px] space-y-3 overflow-y-auto">
                                {activeUsers.map((activeUser) => (
                                    <div
                                        key={activeUser.id}
                                        className="rounded-lg border border-gray-200 p-3"
                                    >
                                        <div className="text-sm font-semibold text-gray-900">
                                            {activeUser.username} ({activeUser.role})
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            {activeUser.email || "Aucun courriel"}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Derniere connexion: {activeUser.lastLoginAt
                                                ? new Date(activeUser.lastLoginAt).toLocaleString()
                                                : "Inconnue"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showAuthLogsModal && (
                <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 px-4 py-4 sm:py-6">
                    <div className="mx-auto flex min-h-full w-full max-w-5xl items-start sm:items-center">
                        <div className="w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold text-gray-900">
                                Auth Log
                            </h2>
                            <div className="flex items-center gap-3">
                                {user?.role === "SUPERADMIN" && authLogsQueryDurationMs !== null && (
                                    <span className="text-xs text-gray-500">
                                        Temps requete: {authLogsQueryDurationMs} ms
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={closeAuthLogsModal}
                                    className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>

                        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <label className="text-sm text-gray-700">
                                Date debut
                                <input
                                    type="date"
                                    value={authLogStartDate}
                                    max={authLogEndDate || undefined}
                                    onChange={(event) => setAuthLogStartDate(event.target.value)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                />
                            </label>
                            <label className="text-sm text-gray-700">
                                Date fin
                                <input
                                    type="date"
                                    value={authLogEndDate}
                                    min={authLogStartDate || undefined}
                                    onChange={(event) => setAuthLogEndDate(event.target.value)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                />
                            </label>
                            <label className="text-sm text-gray-700 sm:col-span-2">
                                Action
                                <select
                                    value={authLogAction}
                                    onChange={(event) => setAuthLogAction(event.target.value)}
                                    className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                                >
                                    {AUTH_LOG_ACTION_OPTIONS.map((option) => (
                                        <option key={option.value || "ALL"} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="mb-4 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    void applyAuthLogFilters();
                                }}
                                className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                            >
                                Rechercher
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAuthLogStartDate(todayDateValue);
                                    setAuthLogEndDate(todayDateValue);
                                    setAuthLogAction("");
                                    void loadAuthLogs(1, true);
                                }}
                                className="rounded bg-gray-50 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                Reinitialiser
                            </button>
                        </div>

                        {loadingAuthLogs ? (
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span
                                    className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
                                    aria-hidden="true"
                                />
                                <span>Chargement des logs auth...</span>
                            </div>
                        ) : authLogsError ? (
                            <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                                {authLogsError}
                            </div>
                        ) : authLogs.length === 0 ? (
                            <p className="text-sm text-gray-500">Aucun resultat.</p>
                        ) : (
                            <>
                                <div className="max-h-[420px] overflow-auto rounded border border-gray-200">
                                    <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
                                        <thead className="bg-gray-50 text-gray-600">
                                            <tr>
                                                <th className="px-3 py-2">Date</th>
                                                <th className="px-3 py-2">Action</th>
                                                <th className="px-3 py-2">Resultat</th>
                                                <th className="px-3 py-2">Usager</th>
                                                <th className="px-3 py-2">Role</th>
                                                <th className="px-3 py-2">IP</th>
                                                <th className="px-3 py-2">Raison</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {authLogs.map((log) => (
                                                <tr key={log.id} className="border-t border-gray-100 align-top">
                                                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatAuthLogTimestamp(log.timestamp)}</td>
                                                    <td className="px-3 py-2 text-gray-800">{log.action || "-"}</td>
                                                    <td className="px-3 py-2 text-gray-800">{log.outcome || "-"}</td>
                                                    <td className="px-3 py-2 text-gray-700">{log.usernameMasked || "-"}</td>
                                                    <td className="px-3 py-2 text-gray-700">{log.role || "-"}</td>
                                                    <td className="px-3 py-2 text-gray-700">{log.ip || "-"}</td>
                                                    <td className="px-3 py-2 text-gray-700">{log.reason || "-"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (authLogPage !== 1) {
                                                void loadAuthLogs(1, true);
                                            }
                                        }}
                                        disabled={authLogPage <= 1}
                                        className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {"<<"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const previousPage = Math.max(1, authLogPage - 1);
                                            if (previousPage !== authLogPage) {
                                                void loadAuthLogs(previousPage, true);
                                            }
                                        }}
                                        disabled={authLogPage <= 1}
                                        className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {"<"}
                                    </button>
                                    <span>
                                        Page {authLogPagination.page}/{Math.max(1, authLogPagination.totalPages)} - {authLogPagination.total} resultats
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const nextPage = Math.min(
                                                Math.max(1, authLogPagination.totalPages),
                                                authLogPage + 1
                                            );
                                            if (nextPage !== authLogPage) {
                                                void loadAuthLogs(nextPage, true);
                                            }
                                        }}
                                        disabled={authLogPage >= Math.max(1, authLogPagination.totalPages)}
                                        className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {">"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const lastPage = Math.max(1, authLogPagination.totalPages);
                                            if (authLogPage !== lastPage) {
                                                void loadAuthLogs(lastPage, true);
                                            }
                                        }}
                                        disabled={authLogPage >= Math.max(1, authLogPagination.totalPages)}
                                        className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {">>"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    </div>
                </div>
            )}

            {showAuthGraphsModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-4 py-4 sm:py-6">
                    <div className="mx-auto flex min-h-full w-full max-w-5xl items-start sm:items-center">
                        <div className="w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    Auth Graphs - {AUTH_GRAPH_TYPE_LABELS[authGraphType]}
                                </h2>
                                <button
                                    type="button"
                                    onClick={closeAuthGraphsModal}
                                    className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                >
                                    Fermer
                                </button>
                            </div>

                            <div className="mb-3 text-xs text-gray-500">
                                Axe X: Date | Axe Y: Nombre de log
                            </div>

                            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                                <label className="text-sm text-gray-700">
                                    Date debut
                                    <input
                                        type="date"
                                        value={authLogStartDate}
                                        max={authLogEndDate || undefined}
                                        onChange={(event) => setAuthLogStartDate(event.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                </label>
                                <label className="text-sm text-gray-700">
                                    Date fin
                                    <input
                                        type="date"
                                        value={authLogEndDate}
                                        min={authLogStartDate || undefined}
                                        onChange={(event) => setAuthLogEndDate(event.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                </label>
                            </div>

                            {loadingAuthGraphs ? (
                                <div className="flex items-center gap-3 text-sm text-gray-500">
                                    <span
                                        className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
                                        aria-hidden="true"
                                    />
                                    <span>Chargement du graphique auth...</span>
                                </div>
                            ) : authGraphsError ? (
                                <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                                    {authGraphsError}
                                </div>
                            ) : authGraphPoints.length === 0 ? (
                                <p className="text-sm text-gray-500">Aucune donnee pour cette plage.</p>
                            ) : (
                                <div className="h-80 w-full rounded border border-gray-200 p-2 sm:p-4">
                                    {authGraphType === "pie" ? (
                                        authGraphPieData.length === 0 ? (
                                            <p className="px-2 py-4 text-sm text-gray-500">Aucune donnee action pour ce graphique.</p>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Tooltip />
                                                    <Legend />
                                                    <Pie
                                                        data={authGraphPieData}
                                                        dataKey="value"
                                                        nameKey="action"
                                                        outerRadius={120}
                                                        label
                                                        onClick={(entry) => {
                                                            const actionName = entry?.action;
                                                            if (typeof actionName === "string" && actionName) {
                                                                openAuthLogsForRangeAndAction(actionName);
                                                            }
                                                        }}
                                                    >
                                                        {authGraphPieData.map((entry) => (
                                                            <Cell
                                                                key={entry.action}
                                                                fill={AUTH_GRAPH_ACTION_COLORS[entry.action as keyof typeof AUTH_GRAPH_ACTION_COLORS] || "#4b5563"}
                                                            />
                                                        ))}
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )
                                    ) : authGraphType === "histogram" ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={authGraphPoints} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="date" />
                                                <YAxis allowDecimals={false} />
                                                <Tooltip
                                                    wrapperStyle={{ pointerEvents: "auto" }}
                                                    content={
                                                        <AuthHistogramTooltip
                                                            actionNames={authGraphActions}
                                                            onOpenLogsForDateAndAction={openAuthLogsForDateAndAction}
                                                        />
                                                    }
                                                />
                                                <Bar dataKey="total" name="Nombre de log" fill="#2563eb" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={authGraphPoints} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="date" />
                                                <YAxis allowDecimals={false} />
                                                <Legend />
                                                <Tooltip
                                                    trigger="click"
                                                    wrapperStyle={{ pointerEvents: "auto" }}
                                                    content={
                                                        <AuthGraphTooltip
                                                            onOpenLogsForDate={openAuthLogsForDate}
                                                        />
                                                    }
                                                />
                                                {authGraphActions.map((actionName) => (
                                                    <Line
                                                        key={actionName}
                                                        type="monotone"
                                                        dataKey={actionName}
                                                        stroke={AUTH_GRAPH_ACTION_COLORS[actionName as keyof typeof AUTH_GRAPH_ACTION_COLORS] || "#4b5563"}
                                                        strokeWidth={2}
                                                        dot={{ r: 3 }}
                                                        activeDot={{ r: 5 }}
                                                        name={actionName}
                                                    />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
};

export default Header;
