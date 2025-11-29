import React from "react";
import { Link, useLocation } from "react-router-dom";

const Header: React.FC = () => {
    const location = useLocation();
    const token = localStorage.getItem("clinia_admin_token");

    const logout = () => {
        localStorage.removeItem("clinia_admin_token");
        window.location.href = "/";
    };

    // 🔍 Détection environnement
    const isDev = window.location.port === "5173";
    const isProd = window.location.port === "8080";

    return (
        <header className="bg-white border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">

                {/* Logo + titre */}
                <Link to="/" className="flex items-center gap-3">
                    <img src="/logo.png" alt="ClinIA logo" className="h-10 w-auto" />
                    <div>
                        <div className="font-semibold text-lg leading-tight">ClinIA</div>
                        <div className="text-xs text-gray-500">
                            Assistant clinique IA – Prototype
                        </div>
                    </div>
                </Link>

                {/* ---------- BADGE ENVIRONNEMENT ---------- */}
                <div className="flex items-center gap-2">
                    {isDev && (
                        <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 border border-blue-300">
                            DEV – localhost:5173
                        </span>
                    )}
                    {isProd && (
                        <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 border border-green-300">
                            PROD – Docker 8080
                        </span>
                    )}
                </div>

                {/* Navigation standard */}
                <nav className="flex items-center gap-4 text-sm">
                    <Link
                        to="/"
                        className={
                            "hover:text-primary transition-colors " +
                            (location.pathname === "/" ? "text-primary font-medium" : "text-gray-600")
                        }
                    >
                        Accueil
                    </Link>

                    <Link
                        to="/quick"
                        className={
                            "hover:text-primary transition-colors " +
                            (location.pathname === "/quick" ? "text-primary font-medium" : "text-gray-600")
                        }
                    >
                        Mode rapide
                    </Link>

                    <Link
                        to="/patient-summary"
                        className={
                            "hover:text-primary transition-colors " +
                            (location.pathname === "/patient-summary" ? "text-primary font-medium" : "text-gray-600")
                        }
                    >
                        Résumé patient
                    </Link>

                    {/* ---------- ADMIN BUTTONS ---------- */}
                    {!token && (
                        <Link
                            to="/admin/login"
                            className={
                                "hover:text-blue-600 transition-colors " +
                                (location.pathname.startsWith("/admin") ? "text-blue-600 font-medium" : "text-gray-600")
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
                                (location.pathname === "/mock-studio" ? "text-blue-600 font-medium" : "text-gray-600")
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
