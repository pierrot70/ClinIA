import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import VoiceNavButton from "./VoiceNavButton";
import { useHomeI18n } from "../contexts/HomeI18nContext";

const Header: React.FC = () => {
    const location = useLocation();
    const { locale, setLocaleFromDropdown, isTranslating } = useHomeI18n();
    const token = localStorage.getItem("clinia_admin_token");
    const FORCE_REAL_STORAGE_KEY = "clinia_force_real";

    const logout = () => {
        localStorage.removeItem("clinia_admin_token");
        window.location.href = "/";
    };

    // 🔍 Détection environnement (Vite)
    const isProd = !!import.meta.env.PROD;
    const isDev = !isProd;
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

    return (
        <header className="bg-white border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">

                {/* Logo + titre */}
                <Link to="/" className="flex items-center gap-3">
                    <img
                        src="/logo.png"
                        alt="ClinIA logo"
                        className="h-10 w-auto"
                    />
                    <div>
                        <div className="font-semibold text-lg leading-tight">
                            ClinIA
                        </div>
                        <div className="text-xs text-gray-500">
                            Assistant clinique IA – Prototype
                        </div>
                    </div>
                </Link>

                {/* ---------- BADGE ENVIRONNEMENT ---------- */}
                <div className="flex items-center gap-2">
                    {isDev && (
                        <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 border border-blue-300">
                            DEV – Docker
                        </span>
                    )}
                    {isProd && (
                        <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 border border-green-300">
                            PROD – Docker
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

                {/* ---------- NAVIGATION ---------- */}
                <nav className="flex items-center gap-4 text-sm">
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
                    {!token && (
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

                    {token && (
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

                    {token && (
                        <button
                            onClick={logout}
                            className="text-sm text-red-600 hover:text-red-700 ml-3"
                        >
                            Déconnexion
                        </button>
                    )}
                </nav>
            </div>
        </header>
    );
};

export default Header;
