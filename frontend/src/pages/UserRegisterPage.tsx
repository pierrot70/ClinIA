import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { SessionExpiredError } from "../services/authService";

const ROLE_OPTIONS = ["MEDECIN", "ADMIN", "SUPERADMIN"] as const;

type NewUserRole = (typeof ROLE_OPTIONS)[number];

type RegisterResponse = {
    data?: {
        user?: {
            id?: string;
            username?: string;
            email?: string | null;
            role?: NewUserRole;
        };
    };
    error?: {
        code?: string;
        message?: string;
    };
};

const UserRegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const { authFetch } = useAuth();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<NewUserRole>("MEDECIN");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await authFetch("/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username,
                    email: email.trim() || undefined,
                    password,
                    role,
                }),
            });

            const payload = (await response.json().catch(() => ({}))) as RegisterResponse;

            if (!response.ok) {
                setError(
                    payload?.error?.message ||
                        "Impossible de creer l'utilisateur."
                );
                return;
            }

            setSuccess(
                `Utilisateur ${payload?.data?.user?.username || username} cree avec succes.`
            );
            setUsername("");
            setEmail("");
            setPassword("");
            setRole("MEDECIN");
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }

            setError("Erreur reseau. Reessayez.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">
                    Creation d'un utilisateur
                </h1>
                <Link
                    to="/mock-studio"
                    className="text-sm text-blue-600 hover:text-blue-700"
                >
                    Retour Mock Studio
                </Link>
            </div>

            <p className="mb-6 text-sm text-gray-600">
                Accessible aux roles ADMIN et SUPERADMIN. Seul SUPERADMIN peut creer un SUPERADMIN.
            </p>

            {error && (
                <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {success && (
                <div className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700">
                    {success}
                </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-5">
                <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="username">
                        Nom d'utilisateur
                    </label>
                    <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        autoComplete="username"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="email">
                        Courriel (optionnel)
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        autoComplete="email"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="password">
                        Mot de passe
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        autoComplete="new-password"
                        required
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="role">
                        Role
                    </label>
                    <select
                        id="role"
                        value={role}
                        onChange={(event) => setRole(event.target.value as NewUserRole)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                        {ROLE_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? "Creation..." : "Creer l'utilisateur"}
                </button>
            </form>
        </div>
    );
};

export default UserRegisterPage;
