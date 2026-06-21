import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import VoiceNavButton from "./VoiceNavButton";
import { OpenAILogsModal } from "./OpenAILogsModal";
import { AuthLogsModal } from "./admin/AuthLogsModal";
import { AuthGraphsModal } from "./admin/AuthGraphsModal";
import { ClinicianInboxModal } from "./admin/ClinicianInboxModal";
import { SecurityIncidentsModal } from "./admin/SecurityIncidentsModal";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { useAuth } from "../hooks/useAuth";
import { useSensitiveReauthDialog } from "../hooks/useSensitiveReauthDialog";
import { isAdminRole } from "../auth/roles";
import { SessionExpiredError } from "../services/authService";
import { useTranslation } from "../hooks/useTranslation";
import { labels } from "../i18n/uiLabels";
import {
    listClinicianCommentsInbox,
    replyToClinicianComment,
    type ClinicianComment,
} from "../services/clinicianCommentsApi";
import {
    acknowledgeSecurityIncident,
    listSecurityIncidents,
    REQUIRED_ACK_ACTION,
    type SecurityIncidentEntry,
} from "../services/securityIncidentApi";
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
    actorUsername: string | null;
    targetUsername: string | null;
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
type InboxRepliedFilter = "" | "yes" | "no";
type SecurityIncidentAcknowledgedFilter = "" | "true" | "false";

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

const HeaderLabel: React.FC<{ text: string }> = ({ text }) => {
    const { locale } = useHomeI18n();
    const { translated } = useTranslation({
        text,
        targetLang: locale,
        namespace: "header",
    });

    return <>{translated}</>;
};

const headerLabels = labels.header;

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
            <div className="text-gray-700"><HeaderLabel text={headerLabels.authGraphTooltip.date} /> {date}</div>
            <div className="text-gray-700"><HeaderLabel text={headerLabels.authGraphTooltip.logs} /> {count ?? 0}</div>
            <button
                type="button"
                onClick={() => onOpenLogsForDate(date)}
                className="mt-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
            >
                <HeaderLabel text={headerLabels.authGraphTooltip.openLogs} />
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
            <div className="mb-1 text-gray-700"><HeaderLabel text={headerLabels.authGraphTooltip.date} /> {date}</div>
            <div className="mb-2 text-gray-700"><HeaderLabel text={headerLabels.authGraphTooltip.totalLogs} /> {total}</div>
            <div className="space-y-1">
                <button
                    type="button"
                    onClick={() => onOpenLogsForDateAndAction(date)}
                    className="block w-full rounded bg-blue-50 px-2 py-1 text-left text-xs text-blue-700 hover:bg-blue-100"
                >
                    <HeaderLabel text={headerLabels.authGraphTooltip.all} />
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
    { value: "PASSWORD_CHANGE", label: "PASSWORD_CHANGE" },
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
            // Log debug pour la langue (après initialisation)
            // Log debug pour la langue (évite l'accès prématuré)
            // Tous les hooks doivent être appelés avant ce useEffect !
            // ...existing code...
        // ...existing code...
    const now = new Date();
    const todayDateValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const location = useLocation();
    const { locale, setLocaleFromDropdown, isTranslating } = useHomeI18n();
    // ...existing code...
    const {
        isAuthenticated,
        user,
        logout: logoutSession,
        authFetch,
    } = useAuth();
    const { requestSensitiveReauth, sensitiveReauthModal } = useSensitiveReauthDialog();
    const FORCE_REAL_STORAGE_KEY = "clinia_force_real";
    const canAccessAdmin = isAuthenticated && isAdminRole(user?.role);
    const isProd = !!import.meta.env.PROD;
    const isDev = !isProd;
    const showFullHeaderNav = isAuthenticated || isDev;
    const showAdminHeaderNav = canAccessAdmin || isDev;
    const showSuperAdminHeaderNav = user?.role === "SUPERADMIN" || isDev;
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
    const [showOpenAILogsModal, setShowOpenAILogsModal] = useState(false);
    const [showClinicianInboxModal, setShowClinicianInboxModal] = useState(false);
    const [authGraphType, setAuthGraphType] = useState<AuthGraphType>("xy");
    const [authLogs, setAuthLogs] = useState<AuthLogEntry[]>([]);
    const [loadingAuthLogs, setLoadingAuthLogs] = useState(false);
    const [authLogsError, setAuthLogsError] = useState<string | null>(null);
    const [authLogsQueryDurationMs, setAuthLogsQueryDurationMs] = useState<number | null>(null);
    const [authLogStartDate, setAuthLogStartDate] = useState(todayDateValue);
    const [authLogEndDate, setAuthLogEndDate] = useState(todayDateValue);
    const [authLogAction, setAuthLogAction] = useState("");
    const [authLogPasswordEventsOnly, setAuthLogPasswordEventsOnly] = useState(false);
    const [authGraphAction, setAuthGraphAction] = useState("");
    const [authLogPage, setAuthLogPage] = useState(1);
    const [authGraphPoints, setAuthGraphPoints] = useState<AuthGraphPoint[]>([]);
    const [authGraphActions, setAuthGraphActions] = useState<string[]>([]);
    const [loadingAuthGraphs, setLoadingAuthGraphs] = useState(false);
    const [authGraphsError, setAuthGraphsError] = useState<string | null>(null);
    const [authGraphsDateSnapshot, setAuthGraphsDateSnapshot] = useState<DateRangeSnapshot | null>(null);
    const [clinicianInboxItems, setClinicianInboxItems] = useState<ClinicianComment[]>([]);
    const [clinicianInboxActors, setClinicianInboxActors] = useState<string[]>([]);
    const [clinicianInboxLoading, setClinicianInboxLoading] = useState(false);
    const [clinicianInboxError, setClinicianInboxError] = useState<string | null>(null);
    const [clinicianInboxActorFilter, setClinicianInboxActorFilter] = useState("");
    const [clinicianInboxCategoryFilter, setClinicianInboxCategoryFilter] = useState("");
    const [clinicianInboxRepliedFilter, setClinicianInboxRepliedFilter] = useState<InboxRepliedFilter>("");
    const [clinicianInboxStartDate, setClinicianInboxStartDate] = useState(todayDateValue);
    const [clinicianInboxEndDate, setClinicianInboxEndDate] = useState(todayDateValue);
    const [hasCheckedClinicianInbox, setHasCheckedClinicianInbox] = useState(false);
    const [authLogPagination, setAuthLogPagination] = useState<AuthLogPagination>({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
    });
    const [clinicianInboxPagination, setClinicianInboxPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
    });
    const [clinicianInboxReplyTargetId, setClinicianInboxReplyTargetId] = useState("");
    const [clinicianInboxReplyMessage, setClinicianInboxReplyMessage] = useState("");
    const [clinicianInboxReplying, setClinicianInboxReplying] = useState(false);
    const [clinicianInboxReplySuccess, setClinicianInboxReplySuccess] = useState("");
    const [showSecurityIncidentsModal, setShowSecurityIncidentsModal] = useState(false);
    const [securityIncidentItems, setSecurityIncidentItems] = useState<SecurityIncidentEntry[]>([]);
    const [securityIncidentLoading, setSecurityIncidentLoading] = useState(false);
    const [securityIncidentError, setSecurityIncidentError] = useState<string | null>(null);
    const [securityIncidentAckingId, setSecurityIncidentAckingId] = useState("");
    const [securityIncidentAcknowledgedFilter, setSecurityIncidentAcknowledgedFilter] =
        useState<SecurityIncidentAcknowledgedFilter>("false");
    const [securityIncidentTypeFilter, setSecurityIncidentTypeFilter] = useState("");
    const [securityIncidentCount, setSecurityIncidentCount] = useState<number | null>(null);
    const [securityIncidentIndicatorError, setSecurityIncidentIndicatorError] = useState(false);
    const [securityIncidentPagination, setSecurityIncidentPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
    });
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showPublicLanguageTip, setShowPublicLanguageTip] = useState(false);
    const ACTIVE_USERS_REFRESH_MS = 5_000;
    const SECURITY_INCIDENTS_REFRESH_MS = 5_000;
    const isPublicHomeHeader = !showFullHeaderNav && location.pathname === "/";
    const LANGUAGE_TIP_STORAGE_KEY = "clinia_home_language_tip_seen";
    const DEMO_TIP_EVENT = "clinia:show-demo-tooltip";
    const clinicianInboxLabels = headerLabels.clinicianCommentsInbox;
    const securityIncidentLabels = headerLabels.securityIncidentsIndicator;
    const securityIncidentsModalLabels = headerLabels.securityIncidentsModal;

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
        { value: "fr-CA", label: "FRA - Français (Canada)" },
        { value: "en-CA", label: "ENG - English (Canada)" },
        { value: "es", label: "SPA - Español" },
        { value: "ko-KR", label: "KOR - 한국어 (대한민국)" },
        { value: "vi", label: "VIE - Tiếng Việt" },
        { value: "no-NO", label: "NOR - Norsk" },
        { value: "ja", label: "JPN - 日本語" },
        { value: "zh", label: "ZHO - 中文（普通话）" },
        { value: "he", label: "HEB - עברית" },
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

    const completePublicLanguageTip = () => {
        try {
            window.sessionStorage.setItem(LANGUAGE_TIP_STORAGE_KEY, "true");
        } catch {}
        setShowPublicLanguageTip(false);
        window.dispatchEvent(new CustomEvent(DEMO_TIP_EVENT));
    };

    useEffect(() => {
        if (!isPublicHomeHeader) {
            setShowPublicLanguageTip(false);
            return;
        }

        let alreadySeen = false;
        try {
            alreadySeen = window.sessionStorage.getItem(LANGUAGE_TIP_STORAGE_KEY) === "true";
        } catch {}

        if (alreadySeen) {
            setShowPublicLanguageTip(false);
            return;
        }

        setShowPublicLanguageTip(true);
        const timerId = window.setTimeout(() => {
            completePublicLanguageTip();
        }, 3_000);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [isPublicHomeHeader]);

    const triggerAppShutdown = async () => {
        const confirmed = window.confirm(
            "Activer l'arret de l'application dans 30 secondes ? Tous les utilisateurs (sauf SUPERADMIN) seront deconnectes."
        );

        if (!confirmed) {
            return;
        }

        const reauthed = await requestSensitiveReauth();
        if (!reauthed) {
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

        const reauthed = await requestSensitiveReauth();
        if (!reauthed) {
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

        const reauthed = await requestSensitiveReauth();
        if (!reauthed) {
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
                if (payload?.error?.code === "REAUTH_REQUIRED") {
                    const reauthed = await requestSensitiveReauth();
                    if (!reauthed) {
                        setActiveUsers([]);
                        return;
                    }

                    try {
                        await loadActiveUsers(showLoadingState);
                    } catch (err) {
                        setActiveUsersError(
                            err instanceof Error
                                ? err.message
                                : labels.auth.sensitiveAction.networkError
                        );
                        setActiveUsers([]);
                    }
                    return;
                }
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
            if (authLogPasswordEventsOnly) {
                query.set("passwordEventsOnly", "true");
            }

            const response = await authFetch(`/api/auth/auth-logs?${query.toString()}`);
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (payload?.error?.code === "REAUTH_REQUIRED") {
                    const reauthed = await requestSensitiveReauth();
                    if (!reauthed) {
                        setAuthLogs([]);
                        setAuthLogsQueryDurationMs(Math.round(performance.now() - requestStartedAt));
                        return;
                    }

                    try {
                        await loadAuthLogs(targetPage, showLoadingState);
                    } catch (err) {
                        setAuthLogsError(
                            err instanceof Error
                                ? err.message
                                : labels.auth.sensitiveAction.networkError
                        );
                        setAuthLogs([]);
                        setAuthLogsQueryDurationMs(Math.round(performance.now() - requestStartedAt));
                    }
                    return;
                }
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
        setAuthLogPasswordEventsOnly(false);
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
        setAuthLogPasswordEventsOnly(false);
        setShowAuthLogsModal(true);
    };

    const openAuthLogsForRangeAndAction = (actionName: string) => {
        setAuthGraphsDateSnapshot({
            startDate: authLogStartDate,
            endDate: authLogEndDate,
        });
        setAuthLogAction(actionName);
        setAuthLogPasswordEventsOnly(false);
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
                if (payload?.error?.code === "REAUTH_REQUIRED") {
                    const reauthed = await requestSensitiveReauth();
                    if (!reauthed) {
                        setAuthGraphPoints([]);
                        setAuthGraphActions([]);
                        return;
                    }

                    try {
                        await loadAuthGraphs();
                    } catch (err) {
                        setAuthGraphsError(
                            err instanceof Error
                                ? err.message
                                : labels.auth.sensitiveAction.networkError
                        );
                        setAuthGraphPoints([]);
                        setAuthGraphActions([]);
                    }
                    return;
                }
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

    const openOpenAILogsModal = () => {
        setShowOpenAILogsModal(true);
    };

    const closeOpenAILogsModal = () => {
        setShowOpenAILogsModal(false);
    };

    const loadClinicianInbox = async (targetPage = 1, showLoadingState = true) => {
        if (showLoadingState) {
            setClinicianInboxLoading(true);
        }
        setClinicianInboxError(null);

        try {
            const response = await listClinicianCommentsInbox(
                targetPage,
                clinicianInboxPagination.limit,
                clinicianInboxActorFilter,
                clinicianInboxCategoryFilter,
                clinicianInboxRepliedFilter,
                clinicianInboxStartDate,
                clinicianInboxEndDate
            );

            if (!response.ok) {
                setClinicianInboxError(response.error.message);
                setClinicianInboxItems([]);
                return;
            }

            setClinicianInboxItems(response.data.items || []);
            setClinicianInboxActors(response.data.availableActorUsernames || []);
            setClinicianInboxReplySuccess("");
            setClinicianInboxPagination(
                response.data.pagination || {
                    page: targetPage,
                    limit: 10,
                    total: 0,
                    totalPages: 1,
                }
            );

            if (response.data.summary?.hasNew) {
                setShowClinicianInboxModal(true);
            }
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }
            setClinicianInboxError("Erreur reseau lors du chargement des nouveaux commentaires.");
            setClinicianInboxItems([]);
        } finally {
            if (showLoadingState) {
                setClinicianInboxLoading(false);
            }
        }
    };

    const openClinicianInboxModal = async () => {
        setIsMobileMenuOpen(false);
        setShowClinicianInboxModal(true);
        await loadClinicianInbox(1, true);
    };

    const loadSecurityIncidents = async (targetPage = 1, showLoadingState = true) => {
        if (showLoadingState) {
            setSecurityIncidentLoading(true);
        }
        setSecurityIncidentError(null);

        try {
            const response = await listSecurityIncidents({
                page: targetPage,
                limit: securityIncidentPagination.limit,
                acknowledged: securityIncidentAcknowledgedFilter || undefined,
                type: securityIncidentTypeFilter || undefined,
            });

            if ("error" in response) {
                setSecurityIncidentError(response.error.message);
                setSecurityIncidentItems([]);
                return;
            }

            setSecurityIncidentItems(response.data.incidents || []);
            setSecurityIncidentPagination(
                response.data.pagination || {
                    page: targetPage,
                    limit: 10,
                    total: 0,
                    totalPages: 1,
                }
            );
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }
            setSecurityIncidentError("Erreur reseau lors du chargement des incidents de securite.");
            setSecurityIncidentItems([]);
        } finally {
            if (showLoadingState) {
                setSecurityIncidentLoading(false);
            }
        }
    };

    const loadSecurityIncidentIndicator = async () => {
        if (!isAuthenticated || user?.role !== "SUPERADMIN") {
            setSecurityIncidentCount(null);
            setSecurityIncidentIndicatorError(false);
            return;
        }

        try {
            const response = await listSecurityIncidents({
                page: 1,
                limit: 1,
                acknowledged: "false",
            });

            if ("error" in response) {
                setSecurityIncidentIndicatorError(true);
                setSecurityIncidentCount(null);
                return;
            }

            setSecurityIncidentIndicatorError(false);
            setSecurityIncidentCount(response.data.pagination.total || 0);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }
            setSecurityIncidentIndicatorError(true);
            setSecurityIncidentCount(null);
        }
    };

    const openSecurityIncidentsModal = async () => {
        setShowSecurityIncidentsModal(true);
        await loadSecurityIncidents(1, true);
    };

    const closeSecurityIncidentsModal = () => {
        setShowSecurityIncidentsModal(false);
        setSecurityIncidentError(null);
        setSecurityIncidentAckingId("");
    };

    const acknowledgeIncidentFromModal = async (incidentId: string) => {
        setSecurityIncidentAckingId(incidentId);
        setSecurityIncidentError(null);

        try {
            const response = await acknowledgeSecurityIncident({
                incidentId,
                action: REQUIRED_ACK_ACTION,
                context: {
                    source: "header_security_incidents_modal",
                },
            });

            if ("error" in response) {
                setSecurityIncidentError(response.error.message);
                return;
            }

            await Promise.all([
                loadSecurityIncidents(securityIncidentPagination.page, false),
                loadSecurityIncidentIndicator(),
            ]);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }
            setSecurityIncidentError("Erreur reseau lors de l'acquittement de l'incident.");
        } finally {
            setSecurityIncidentAckingId("");
        }
    };

    const closeClinicianInboxModal = async () => {
        setShowClinicianInboxModal(false);
        setClinicianInboxError(null);
        setClinicianInboxReplyTargetId("");
        setClinicianInboxReplyMessage("");
        setClinicianInboxReplySuccess("");
    };

    const submitClinicianInboxReply = async () => {
        if (!clinicianInboxReplyTargetId || !clinicianInboxReplyMessage.trim()) {
            return;
        }

        setClinicianInboxReplying(true);
        setClinicianInboxError(null);
        setClinicianInboxReplySuccess("");

        try {
            const response = await replyToClinicianComment(
                clinicianInboxReplyTargetId,
                clinicianInboxReplyMessage.trim()
            );

            if (!response.ok) {
                setClinicianInboxError(response.error.message);
                return;
            }

            setClinicianInboxItems((currentItems) =>
                currentItems.map((item) =>
                    item.id === response.data.id ? response.data : item
                )
            );
            setClinicianInboxReplySuccess(clinicianInboxLabels.replySaved);
            setClinicianInboxReplyTargetId("");
            setClinicianInboxReplyMessage("");
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                logout();
                return;
            }
            setClinicianInboxError("Erreur reseau lors de l'enregistrement de la reponse.");
        } finally {
            setClinicianInboxReplying(false);
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
    }, [showAuthLogsModal, authLogStartDate, authLogEndDate, authLogAction, authLogPasswordEventsOnly]);

    useEffect(() => {
        if (!showAuthGraphsModal) {
            return;
        }

        void loadAuthGraphs();
    }, [showAuthGraphsModal, authLogStartDate, authLogEndDate, authGraphAction]);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!isAuthenticated || user?.role !== "SUPERADMIN") {
            setHasCheckedClinicianInbox(false);
            return;
        }

        if (hasCheckedClinicianInbox) {
            return;
        }

        setHasCheckedClinicianInbox(true);
        void loadClinicianInbox(1, true);
    }, [hasCheckedClinicianInbox, isAuthenticated, user?.role]);

    useEffect(() => {
        if (!isAuthenticated || user?.role !== "SUPERADMIN") {
            setSecurityIncidentCount(null);
            setSecurityIncidentIndicatorError(false);
            return;
        }

        void loadSecurityIncidentIndicator();

        const handleWindowFocus = () => {
            void loadSecurityIncidentIndicator();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void loadSecurityIncidentIndicator();
            }
        };

        const intervalId = window.setInterval(() => {
            void loadSecurityIncidentIndicator();
        }, SECURITY_INCIDENTS_REFRESH_MS);

        window.addEventListener("focus", handleWindowFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleWindowFocus);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [isAuthenticated, user?.role]);

    useEffect(() => {
        if (!showClinicianInboxModal) {
            return;
        }

        void loadClinicianInbox(1, true);
    }, [
        showClinicianInboxModal,
        clinicianInboxActorFilter,
        clinicianInboxCategoryFilter,
        clinicianInboxRepliedFilter,
        clinicianInboxStartDate,
        clinicianInboxEndDate,
    ]);

    useEffect(() => {
        if (!showSecurityIncidentsModal) {
            return;
        }

        void loadSecurityIncidents(1, true);
    }, [
        showSecurityIncidentsModal,
        securityIncidentAcknowledgedFilter,
        securityIncidentTypeFilter,
    ]);

    return (
        <header className="bg-white border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 py-3">
                <div className="grid grid-cols-3 items-center lg:hidden">
                    <Link to="/" className="justify-self-start text-lg font-semibold leading-tight text-gray-900">
                        ClinIA
                    </Link>

                    {showFullHeaderNav ? (
                        <>
                            <div className="justify-self-center">
                                {canAccessAdmin ? (
                                    <VoiceNavButton />
                                ) : (
                                    <label className="flex items-center gap-2 text-gray-600">
                                        <span className="sr-only">
                                            <HeaderLabel text={headerLabels.controls.language} />
                                        </span>
                                        <select
                                            className="max-w-[9rem] rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                                            value={locale}
                                            onChange={onLanguageChange}
                                            disabled={isTranslating}
                                            aria-label={headerLabels.controls.language}
                                        >
                                            {languageOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                                className="justify-self-end rounded border border-gray-300 px-3 py-1 text-sm text-gray-700"
                                aria-label={headerLabels.controls.openMenu}
                            >
                                <HeaderLabel text={isMobileMenuOpen ? headerLabels.controls.close : headerLabels.controls.menu} />
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="relative justify-self-center">
                                {showPublicLanguageTip && (
                                    <div className="absolute left-1/2 top-full z-[100] mt-3 w-72 -translate-x-1/2 rounded-xl border border-cyan-500 bg-cyan-50 p-4 text-sm text-cyan-950 shadow-2xl">
                                        <span className="absolute bottom-full left-1/2 h-3 w-3 -translate-x-1/2 translate-y-1/2 rotate-45 border-l border-t border-cyan-500 bg-cyan-50" aria-hidden="true" />
                                        <div className="mb-2 text-base font-semibold">
                                            <HeaderLabel text={headerLabels.controls.language} />
                                        </div>
                                        <p><HeaderLabel text={headerLabels.publicHome.languageTooltip} /></p>
                                        <button
                                            type="button"
                                            onClick={completePublicLanguageTip}
                                            className="mt-3 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                                        >
                                            <HeaderLabel text={headerLabels.publicHome.tooltipOk} />
                                        </button>
                                    </div>
                                )}
                            <label className="flex items-center gap-2 text-gray-600">
                                <span className="text-xs"><HeaderLabel text={headerLabels.controls.language} /></span>
                                <select
                                    className={
                                        "rounded border bg-white px-2 py-1 text-xs transition " +
                                        (showPublicLanguageTip
                                            ? "border-emerald-500 ring-2 ring-emerald-200"
                                            : "border-gray-300")
                                    }
                                    value={locale}
                                    onChange={onLanguageChange}
                                    disabled={isTranslating}
                                    aria-label={headerLabels.controls.language}
                                >
                                    {languageOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            </div>
                            <Link to="/" className="justify-self-end text-sm text-gray-700">
                                <HeaderLabel text={headerLabels.nav.home} />
                            </Link>
                        </>
                    )}
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
                                <HeaderLabel text={headerLabels.brand.subtitle} />
                            </div>
                        </div>
                    </Link>

                    <div className="flex items-center gap-3">
                        {isAuthenticated && user && (
                            <div className="text-right">
                                <div className="max-w-[260px] truncate text-sm font-medium text-gray-900">
                                    {user.email || user.id || "Utilisateur"}
                                </div>
                                <div className="text-xs uppercase tracking-wide text-gray-500">
                                    {user.role}
                                </div>
                                {user.role === "SUPERADMIN" && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void openSecurityIncidentsModal();
                                        }}
                                        className={
                                            "mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition " +
                                            (securityIncidentIndicatorError
                                                ? "border-red-200 bg-red-50 text-red-700"
                                                : (securityIncidentCount || 0) > 0
                                                    ? "border-amber-200 bg-amber-50 text-amber-800"
                                                    : "border-emerald-200 bg-emerald-50 text-emerald-700")
                                        }
                                        title={
                                            securityIncidentIndicatorError
                                                ? securityIncidentLabels.error
                                                : securityIncidentCount === 1
                                                    ? securityIncidentLabels.one
                                                    : securityIncidentCount && securityIncidentCount > 1
                                                        ? `${securityIncidentCount} ${securityIncidentLabels.manySuffix}`
                                                        : securityIncidentLabels.none
                                        }
                                        aria-label={securityIncidentLabels.refresh}
                                    >
                                        <span>{securityIncidentLabels.label}</span>
                                        <span className="font-semibold">
                                            {securityIncidentIndicatorError ? "!" : securityIncidentCount ?? "…"}
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}
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
                                        ? headerLabels.aiMode.forceRealTitle
                                        : headerLabels.aiMode.mockTitle
                                }
                            >
                                <HeaderLabel text={forceReal ? headerLabels.aiMode.real : headerLabels.aiMode.mock} />
                            </button>
                        )}
                    </div>
                </div>

                <nav className="mt-3 hidden items-center gap-4 text-sm lg:flex">
                    {showFullHeaderNav && canAccessAdmin && <VoiceNavButton />}

                    <div className="relative">
                        {showPublicLanguageTip && (
                            <div className="absolute left-1/2 top-full z-[100] mt-3 w-72 -translate-x-1/2 rounded-xl border border-cyan-500 bg-cyan-50 p-4 text-sm text-cyan-950 shadow-2xl">
                                <span className="absolute bottom-full left-1/2 h-3 w-3 -translate-x-1/2 translate-y-1/2 rotate-45 border-l border-t border-cyan-500 bg-cyan-50" aria-hidden="true" />
                                <div className="mb-2 text-base font-semibold">
                                    <HeaderLabel text={headerLabels.controls.language} />
                                </div>
                                <p><HeaderLabel text={headerLabels.publicHome.languageTooltip} /></p>
                                <button
                                    type="button"
                                    onClick={completePublicLanguageTip}
                                    className="mt-3 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                                >
                                    <HeaderLabel text={headerLabels.publicHome.tooltipOk} />
                                </button>
                            </div>
                        )}
                        <label className="flex items-center gap-2 text-gray-600">
                            <span className="text-xs"><HeaderLabel text={headerLabels.controls.language} /></span>
                            <select
                                className={
                                    "rounded border bg-white px-2 py-1 text-xs transition " +
                                    (showPublicLanguageTip
                                        ? "border-emerald-500 ring-2 ring-emerald-200"
                                        : "border-gray-300")
                                }
                                value={locale}
                                onChange={onLanguageChange}
                                disabled={isTranslating}
                                aria-label={headerLabels.controls.language}
                            >
                                {languageOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <Link to="/" className={linkClass("/")}>
                        <HeaderLabel text={headerLabels.nav.home} />
                    </Link>

                    {showFullHeaderNav && (
                        <>
                            <Link to="/clinical" className={linkClass("/clinical")}>
                                <HeaderLabel text={headerLabels.nav.clinicalAnalysis} />
                            </Link>

                            <Link to="/comments" className={linkClass("/comments")}>
                                <HeaderLabel text={headerLabels.nav.comments} />
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
                                    <HeaderLabel text={headerLabels.nav.clinicManagement} />
                                    <span className="text-xs">▾</span>
                                </button>
                                <div className="absolute right-0 top-full z-10 mt-2 hidden min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg transition group-hover:block group-focus-within:block">
                                        {[
                                            {
                                                label: headerLabels.nav.appointments,
                                                path: "/appointments",
                                            },
                                            {
                                                label: headerLabels.nav.patients,
                                                path: "/patients",
                                            },
                                            {
                                                label: headerLabels.nav.cliniques,
                                                path: "/cliniques",
                                            },
                                            {
                                                label: headerLabels.nav.specialists,
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
                                            <HeaderLabel text={item.label} />
                                        </Link>
                                    ))}
                                    {showAdminHeaderNav && (
                                        <button
                                            type="button"
                                            onClick={openOpenAILogsModal}
                                            className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                        >
                                            <HeaderLabel text={headerLabels.nav.openaiLogs} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {showSuperAdminHeaderNav && (
                        <div className="relative group">
                            <button
                                type="button"
                                className="flex items-center gap-1 rounded px-3 py-1 text-sm text-gray-600 transition hover:text-primary"
                            >
                                <HeaderLabel text={headerLabels.nav.appManagement} />
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
                                    <HeaderLabel text={headerLabels.appManagement.activeUsers} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void openAuthLogsModal();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                >
                                    <HeaderLabel text={headerLabels.appManagement.authLogs} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void openClinicianInboxModal();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-amber-900 transition hover:bg-amber-50"
                                >
                                    <HeaderLabel text={headerLabels.appManagement.newComments} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void openSecurityIncidentsModal();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-red-700 transition hover:bg-red-50"
                                >
                                    <HeaderLabel text={headerLabels.appManagement.securityIncidents} />
                                </button>
                                <details className="group/graphs border-t border-gray-100">
                                    <summary className="cursor-pointer list-none px-4 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50">
                                        <HeaderLabel text={headerLabels.appManagement.authGraphs} />
                                    </summary>
                                    <div className="space-y-1 pb-2 pl-4 pr-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                openAuthGraphsModal("xy");
                                            }}
                                            className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                        >
                                            <HeaderLabel text={headerLabels.appManagement.xyGraph} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                openAuthGraphsModal("pie");
                                            }}
                                            className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                        >
                                            <HeaderLabel text={headerLabels.appManagement.pieGraph} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                openAuthGraphsModal("histogram");
                                            }}
                                            className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                                        >
                                            <HeaderLabel text={headerLabels.appManagement.histogramGraph} />
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
                                    <HeaderLabel text={headerLabels.appManagement.shutdown} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void clearMaintenance();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-green-700 transition hover:bg-green-50"
                                >
                                    <HeaderLabel text={headerLabels.appManagement.clearMaintenance} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void forceReopenMaintenance();
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm text-emerald-800 transition hover:bg-emerald-50"
                                >
                                    <HeaderLabel text={headerLabels.appManagement.forceReopen} />
                                </button>
                            </div>
                        </div>
                            )}

                            <Link to="/quick" className={linkClass("/quick")}>
                                <HeaderLabel text={headerLabels.nav.quickMode} />
                            </Link>

                            <Link
                                to="/patient-summary"
                                className={linkClass("/patient-summary")}
                            >
                                <HeaderLabel text={headerLabels.nav.patientSummary} />
                            </Link>
                        </>
                    )}

                    {/* ---------- ADMIN ---------- */}
                    {showFullHeaderNav && !showAdminHeaderNav && (
                        <Link
                            to="/admin/login"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname.startsWith("/admin")
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            <HeaderLabel text={headerLabels.nav.admin} />
                        </Link>
                    )}

                    {showAdminHeaderNav && (
                        <Link
                            to="/mock-studio"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname === "/mock-studio"
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            <HeaderLabel text={headerLabels.nav.mockStudio} />
                        </Link>
                    )}

                    {showAdminHeaderNav && (
                        <Link
                            to="/admin/patient-audits"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname === "/admin/patient-audits"
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            <HeaderLabel text={headerLabels.nav.patientAudits} />
                        </Link>
                    )}

                    {showAdminHeaderNav && (
                        <Link
                            to="/admin/openai-logs"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname === "/admin/openai-logs"
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            <HeaderLabel text={headerLabels.nav.openaiAudits} />
                        </Link>
                    )}

                    {showAdminHeaderNav && (
                        <Link
                            to="/admin/db-status"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname === "/admin/db-status"
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            <HeaderLabel text="Etat BD" />
                        </Link>
                    )}

                    {showAdminHeaderNav && showSuperAdminHeaderNav && (
                        <Link
                            to="/admin/users/manage"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname === "/admin/users/manage"
                                    ? "text-blue-600 font-medium"
                                    : "text-gray-600")
                            }
                        >
                            <HeaderLabel text={headerLabels.nav.users} />
                        </Link>
                    )}

                    {isAuthenticated && (
                        <button
                            onClick={logout}
                            className="text-sm text-red-600 hover:text-red-700 ml-3"
                        >
                            <HeaderLabel text={headerLabels.nav.logout} />
                        </button>
                    )}
                </nav>

                {showFullHeaderNav && isMobileMenuOpen && (
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
                                    <HeaderLabel text={forceReal ? headerLabels.aiMode.real : headerLabels.aiMode.mock} />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            {canAccessAdmin && <VoiceNavButton />}
                            <label className="flex items-center gap-2 text-gray-600">
                                <span className="text-xs"><HeaderLabel text={headerLabels.controls.language} /></span>
                                <select
                                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                                    value={locale}
                                    onChange={onLanguageChange}
                                    disabled={isTranslating}
                                    aria-label={headerLabels.controls.language}
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
                            <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.home} /></Link>
                            <Link to="/clinical" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.clinicalAnalysis} /></Link>
                            <Link to="/comments" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.comments} /></Link>
                            <Link to="/appointments" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.appointments} /></Link>
                            <Link to="/patients" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.patients} /></Link>
                            <Link to="/cliniques" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.cliniques} /></Link>
                            <Link to="/specialists" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.specialists} /></Link>
                            {showAdminHeaderNav && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        openOpenAILogsModal();
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <HeaderLabel text={headerLabels.nav.openaiLogs} />
                                </button>
                            )}
                            <Link to="/quick" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.quickMode} /></Link>
                            <Link to="/patient-summary" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.patientSummary} /></Link>
                        </div>

                        {showSuperAdminHeaderNav && (
                            <div className="space-y-1 border-t border-gray-100 pt-2">
                                <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500"><HeaderLabel text={headerLabels.nav.appManagement} /></div>
                                <button type="button" onClick={() => { void openActiveUsersModal(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.appManagement.activeUsers} /></button>
                                <button type="button" onClick={() => { void openAuthLogsModal(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.appManagement.authLogs} /></button>
                                <button type="button" onClick={() => { void openClinicianInboxModal(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-amber-900 hover:bg-amber-50"><HeaderLabel text={headerLabels.appManagement.newComments} /></button>
                                <button type="button" onClick={() => { void openSecurityIncidentsModal(); setIsMobileMenuOpen(false); }} className="block w-full rounded px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50"><HeaderLabel text={headerLabels.appManagement.securityIncidents} /></button>
                                <details>
                                    <summary className="cursor-pointer rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.appManagement.authGraphs} /></summary>
                                    <div className="mt-1 space-y-1 pl-2">
                                        <button type="button" onClick={() => { openAuthGraphsModal("xy"); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.appManagement.xyGraph} /></button>
                                        <button type="button" onClick={() => { openAuthGraphsModal("pie"); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.appManagement.pieGraph} /></button>
                                        <button type="button" onClick={() => { openAuthGraphsModal("histogram"); }} className="block w-full rounded px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.appManagement.histogramGraph} /></button>
                                    </div>
                                </details>
                                <button type="button" onClick={() => { void triggerAppShutdown(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50"><HeaderLabel text={headerLabels.appManagement.shutdown} /></button>
                                <button type="button" onClick={() => { void clearMaintenance(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-green-700 hover:bg-green-50"><HeaderLabel text={headerLabels.appManagement.clearMaintenance} /></button>
                                <button type="button" onClick={() => { void forceReopenMaintenance(); }} className="block w-full rounded px-2 py-2 text-left text-sm text-emerald-800 hover:bg-emerald-50"><HeaderLabel text={headerLabels.appManagement.forceReopen} /></button>
                            </div>
                        )}

                        <div className="space-y-1 border-t border-gray-100 pt-2">
                            {!isAuthenticated && (
                                <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.login} /></Link>
                            )}

                            {showFullHeaderNav && !showAdminHeaderNav && (
                                <Link to="/admin/login" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.admin} /></Link>
                            )}

                            {showAdminHeaderNav && (
                                <Link to="/mock-studio" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.mockStudio} /></Link>
                            )}

                            {showAdminHeaderNav && (
                                <Link to="/admin/patient-audits" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.patientAudits} /></Link>
                            )}

                            {showAdminHeaderNav && (
                                <Link to="/admin/openai-logs" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.openaiAudits} /></Link>
                            )}

                            {showAdminHeaderNav && (
                                <Link to="/admin/db-status" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text="Etat BD" /></Link>
                            )}

                            {showAdminHeaderNav && showSuperAdminHeaderNav && (
                                <Link to="/admin/users/manage" onClick={() => setIsMobileMenuOpen(false)} className="block rounded px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"><HeaderLabel text={headerLabels.nav.users} /></Link>
                            )}

                            {isAuthenticated && (
                                <button
                                    onClick={logout}
                                    className="block w-full rounded px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                    <HeaderLabel text={headerLabels.nav.logout} />
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
                                <HeaderLabel text={headerLabels.activeUsersModal.title} />
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void loadActiveUsers(true);
                                    }}
                                    className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
                                >
                                    <HeaderLabel text={headerLabels.controls.refresh} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowActiveUsersModal(false)}
                                    className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                >
                                    <HeaderLabel text={headerLabels.controls.close} />
                                </button>
                            </div>
                        </div>

                        {loadingActiveUsers ? (
                            <p className="text-sm text-gray-500"><HeaderLabel text={headerLabels.activeUsersModal.loading} /></p>
                        ) : activeUsersError ? (
                            <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                                {activeUsersError}
                            </div>
                        ) : activeUsers.length === 0 ? (
                            <p className="text-sm text-gray-500"><HeaderLabel text={headerLabels.activeUsersModal.empty} /></p>
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
                                            {activeUser.email || <HeaderLabel text={headerLabels.activeUsersModal.noEmail} />}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            <HeaderLabel text={headerLabels.activeUsersModal.lastLogin} /> {activeUser.lastLoginAt
                                                ? new Date(activeUser.lastLoginAt).toLocaleString()
                                                : <HeaderLabel text={headerLabels.activeUsersModal.unknown} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <AuthLogsModal
                isOpen={showAuthLogsModal}
                isSuperAdmin={user?.role === "SUPERADMIN"}
                queryDurationMs={authLogsQueryDurationMs}
                startDate={authLogStartDate}
                endDate={authLogEndDate}
                action={authLogAction}
                passwordEventsOnly={authLogPasswordEventsOnly}
                options={AUTH_LOG_ACTION_OPTIONS}
                loading={loadingAuthLogs}
                error={authLogsError}
                logs={authLogs}
                pagination={authLogPagination}
                headerLabels={headerLabels}
                renderLabel={(text) => <HeaderLabel text={text} />}
                formatTimestamp={formatAuthLogTimestamp}
                onClose={closeAuthLogsModal}
                onStartDateChange={setAuthLogStartDate}
                onEndDateChange={setAuthLogEndDate}
                onActionChange={setAuthLogAction}
                onPasswordEventsOnlyChange={setAuthLogPasswordEventsOnly}
                onSearch={() => {
                    void applyAuthLogFilters();
                }}
                onReset={() => {
                    setAuthLogStartDate(todayDateValue);
                    setAuthLogEndDate(todayDateValue);
                    setAuthLogAction("");
                    setAuthLogPasswordEventsOnly(false);
                    void loadAuthLogs(1, true);
                }}
                onLoadPage={(page) => {
                    void loadAuthLogs(page, true);
                }}
            />

            <AuthGraphsModal
                isOpen={showAuthGraphsModal}
                title={`${headerLabels.authGraphsModal.titlePrefix} - ${AUTH_GRAPH_TYPE_LABELS[authGraphType]}`}
                startDate={authLogStartDate}
                endDate={authLogEndDate}
                loading={loadingAuthGraphs}
                error={authGraphsError}
                graphType={authGraphType}
                graphPoints={authGraphPoints}
                graphActions={authGraphActions}
                pieData={authGraphPieData}
                graphActionColors={AUTH_GRAPH_ACTION_COLORS}
                headerLabels={headerLabels}
                renderLabel={(text) => <HeaderLabel text={text} />}
                histogramTooltip={
                    <AuthHistogramTooltip
                        actionNames={authGraphActions}
                        onOpenLogsForDateAndAction={openAuthLogsForDateAndAction}
                    />
                }
                lineTooltip={<AuthGraphTooltip onOpenLogsForDate={openAuthLogsForDate} />}
                onClose={closeAuthGraphsModal}
                onStartDateChange={setAuthLogStartDate}
                onEndDateChange={setAuthLogEndDate}
                onPieSliceClick={openAuthLogsForRangeAndAction}
            />

            <ClinicianInboxModal
                isOpen={showClinicianInboxModal}
                labels={clinicianInboxLabels}
                headerLabels={{ controls: { search: headerLabels.controls.search } }}
                items={clinicianInboxItems}
                actors={clinicianInboxActors}
                loading={clinicianInboxLoading}
                error={clinicianInboxError}
                actorFilter={clinicianInboxActorFilter}
                categoryFilter={clinicianInboxCategoryFilter}
                repliedFilter={clinicianInboxRepliedFilter}
                startDate={clinicianInboxStartDate}
                endDate={clinicianInboxEndDate}
                pagination={clinicianInboxPagination}
                replyTargetId={clinicianInboxReplyTargetId}
                replyMessage={clinicianInboxReplyMessage}
                replying={clinicianInboxReplying}
                replySuccess={clinicianInboxReplySuccess}
                onClose={() => { void closeClinicianInboxModal(); }}
                onRefresh={() => { void loadClinicianInbox(1, true); }}
                onActorFilterChange={setClinicianInboxActorFilter}
                onCategoryFilterChange={setClinicianInboxCategoryFilter}
                onRepliedFilterChange={setClinicianInboxRepliedFilter}
                onStartDateChange={setClinicianInboxStartDate}
                onEndDateChange={setClinicianInboxEndDate}
                onSearch={() => { void loadClinicianInbox(1, true); }}
                onToggleReply={(itemId) => {
                    setClinicianInboxReplyTargetId(clinicianInboxReplyTargetId === itemId ? "" : itemId);
                    setClinicianInboxReplyMessage("");
                    setClinicianInboxReplySuccess("");
                }}
                onReplyMessageChange={setClinicianInboxReplyMessage}
                onSubmitReply={() => { void submitClinicianInboxReply(); }}
                onCancelReply={() => {
                    setClinicianInboxReplyTargetId("");
                    setClinicianInboxReplyMessage("");
                }}
                onLoadPage={(page) => { void loadClinicianInbox(page, true); }}
            />

            <SecurityIncidentsModal
                isOpen={showSecurityIncidentsModal}
                items={securityIncidentItems}
                loading={securityIncidentLoading}
                error={securityIncidentError}
                ackingId={securityIncidentAckingId}
                acknowledgedFilter={securityIncidentAcknowledgedFilter}
                typeFilter={securityIncidentTypeFilter}
                pagination={securityIncidentPagination}
                headerLabels={headerLabels}
                onClose={closeSecurityIncidentsModal}
                onRefresh={() => {
                    void loadSecurityIncidents(1, true);
                    void loadSecurityIncidentIndicator();
                }}
                onAcknowledgedFilterChange={setSecurityIncidentAcknowledgedFilter}
                onTypeFilterChange={setSecurityIncidentTypeFilter}
                onAcknowledge={(incidentId) => {
                    void acknowledgeIncidentFromModal(incidentId);
                }}
                onLoadPage={(page) => {
                    void loadSecurityIncidents(page, true);
                }}
            />

            {sensitiveReauthModal}
            <OpenAILogsModal
                isOpen={showOpenAILogsModal}
                onClose={closeOpenAILogsModal}
                authFetch={authFetch}
                onSessionExpired={logout}
            />
        </header>
    );
};

export default Header;
