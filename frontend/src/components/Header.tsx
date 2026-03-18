import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import VoiceNavButton from "./VoiceNavButton";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { useAuth } from "../hooks/useAuth";
import { isAdminRole } from "../auth/roles";
import { SessionExpiredError } from "../services/authService";

type ActiveUser = {
    id: string;
    username: string;
    email: string | null;
    role: string;
    isActive: boolean;
    lastLoginAt?: string | null;
};

const Header: React.FC = () => {
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
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <header className="bg-white border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 py-3">
                <div className="flex items-center justify-start gap-3 lg:justify-between">
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
                            <div className="hidden text-xs text-gray-500 sm:block">
                                Assistant clinique IA – Prototype
                            </div>
                        </div>
                    </Link>

                    <div className="flex items-center gap-2">
                        <div className="hidden items-center gap-2 lg:flex">
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

                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 lg:hidden"
                            aria-label="Ouvrir le menu"
                        >
                            {isMobileMenuOpen ? "Fermer" : "Menu"}
                        </button>
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
        </header>
    );
};

export default Header;
