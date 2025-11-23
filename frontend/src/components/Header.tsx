import React from "react";
import { Stethoscope } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const Header: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const token = localStorage.getItem("clinia_admin_token");

    const logout = () => {
        localStorage.removeItem("clinia_admin_token");
        navigate("/admin-login");
    };

    return (
        <header className="bg-white border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                {/* Logo + title */}
                <Link to="/" className="flex items-center gap-3">
                    <img src="/logo.png" alt="ClinIA logo" className="h-10 w-auto" />

                    <div>
                        <div className="font-semibold text-lg leading-tight">ClinIA</div>
                        <div className="text-xs text-gray-500">Assistant clinique IA – Prototype</div>
                    </div>
                </Link>

                {/* Navigation */}
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

                    {/* ------------------------------- */}
                    {/* 🔐 Gestion Admin */}
                    {/* ------------------------------- */}
                    {!token ? (
                        // Pas connecté → bouton Admin
                        <Link
                            to="/admin-login"
                            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                        >
                            Admin
                        </Link>
                    ) : (
                        // Connecté → MockStudio + Logout
                        <>
                            <Link
                                to="/mock-studio"
                                className={
                                    "px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors " +
                                    (location.pathname === "/mock-studio" ? "font-medium" : "")
                                }
                            >
                                Mock Studio
                            </Link>

                            <button
                                onClick={logout}
                                className="px-3 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                                Déconnexion
                            </button>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
};

export default Header;
