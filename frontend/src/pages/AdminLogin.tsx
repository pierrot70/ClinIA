// frontend/src/pages/AdminLogin.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

// En prod (DigitalOcean), on veut appeler /api sur le même domaine (https://clinique-ai.ca)
// En dev local, on peut utiliser VITE_API_URL (ex: http://localhost:4000) ou fallback localhost.
const API_URL =
    import.meta.env.PROD
        ? "" // same-origin
        : (import.meta.env.VITE_API_URL || "http://localhost:4000");

const AdminLogin: React.FC = () => {
    const [username, setUsername] = useState("admin");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || "Erreur de connexion");
            }

            localStorage.setItem("clinia_admin_token", data.token);
            navigate("/mock-studio");
        } catch (err: any) {
            setError(err?.message || "Erreur inconnue");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <h1 className="text-2xl font-semibold mb-4 text-gray-900">
                Connexion administrateur
            </h1>
            <p className="text-sm text-gray-600 mb-4">
                Accès réservé à la configuration clinique (Mock Studio).
            </p>

            {error && (
                <div className="mb-3 p-2 rounded bg-red-50 text-red-700 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Nom d'utilisateur
                    </label>
                    <input
                        type="text"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Mot de passe
                    </label>
                    <input
                        type="password"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? "Connexion..." : "Se connecter"}
                </button>
            </form>
        </div>
    );
};

export default AdminLogin;
