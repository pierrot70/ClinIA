import React, { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getDefaultRouteForRole, isAdminRole, type UserRole } from "../auth/roles";
import { useAuth } from "../hooks/useAuth";

type LoginPageProps = {
    adminOnly?: boolean;
};

const LoginPage: React.FC<LoginPageProps> = ({ adminOnly = false }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [registerMode, setRegisterMode] = useState(false);
    const [registerRole, setRegisterRole] = useState<UserRole>("MEDECIN");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const location = useLocation();
    const navigate = useNavigate();
    const { isAuthenticated, user, login, registerSelf, logout } = useAuth();

    const redirectTarget = useMemo(() => {
        const from = (location.state as { from?: string } | null)?.from;
        if (typeof from === "string" && from.trim().length > 0) {
            return from;
        }
        if (user) {
            return adminOnly ? getDefaultRouteForRole(user.role) : "/";
        }
        return adminOnly ? "/mock-studio" : "/";
    }, [adminOnly, location.state, user]);

    if (isAuthenticated && user) {
        if (adminOnly && !isAdminRole(user.role)) {
            return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
        }

        return <Navigate to={redirectTarget} replace />;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const session = registerMode && !adminOnly
                ? await registerSelf({ email, password, role: registerRole })
                : await login({ email, password });

            if (adminOnly && !isAdminRole(session.user.role)) {
                await logout();
                setError("Acces reserve aux comptes administrateurs.");
                return;
            }

            const from = (location.state as { from?: string } | null)?.from;
            const destination =
                typeof from === "string" && from.trim().length > 0
                    ? from
                    : adminOnly
                        ? getDefaultRouteForRole(session.user.role)
                        : "/";

            navigate(destination, { replace: true });
        } catch (err: unknown) {
            if (err instanceof Error && err.message) {
                setError(err.message);
            } else {
                setError(
                    registerMode
                        ? "Impossible de creer le compte."
                        : "Impossible de se connecter. Verifiez vos identifiants."
                );
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <h1 className="text-2xl font-semibold mb-2 text-gray-900">
                {adminOnly
                    ? "Connexion administrateur"
                    : registerMode
                        ? "Creation de compte ClinIA"
                        : "Connexion ClinIA"}
            </h1>
            <p className="text-sm text-gray-600 mb-6">
                {adminOnly
                    ? "Acces reserve a la console d'administration ClinIA."
                    : registerMode
                        ? "Creer un compte MEDECIN avec votre courriel et mot de passe."
                        : "Connectez-vous pour acceder aux modules cliniques securises."}
            </p>

            {!adminOnly && (
                <button
                    type="button"
                    onClick={() => setRegisterMode((prev) => !prev)}
                    className="mb-4 text-sm text-blue-600 hover:text-blue-700"
                >
                    {registerMode
                        ? "J'ai deja un compte"
                        : "Je n'ai pas de compte, en creer un"}
                </button>
            )}

            {error && (
                <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="email">
                        {registerMode && !adminOnly
                            ? "Courriel"
                            : "Identifiant (courriel ou nom d'utilisateur)"}
                    </label>
                    <input
                        id="email"
                        type={registerMode && !adminOnly ? "email" : "text"}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete={registerMode && !adminOnly ? "email" : "username"}
                        required
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="password">
                        Mot de passe
                    </label>
                    <input
                        id="password"
                        type="password"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                    />
                </div>

                {registerMode && !adminOnly && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="register-role">
                            Role du compte
                        </label>
                        <select
                            id="register-role"
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            value={registerRole}
                            onChange={(event) =>
                                setRegisterRole(event.target.value as UserRole)
                            }
                        >
                            <option value="MEDECIN">MEDECIN</option>
                            <option value="ADMIN">ADMIN</option>
                            <option value="SUPERADMIN">SUPERADMIN</option>
                        </select>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading
                        ? registerMode && !adminOnly
                            ? "Creation..."
                            : "Connexion..."
                        : registerMode && !adminOnly
                            ? "Creer mon compte"
                            : "Se connecter"}
                </button>
            </form>
        </div>
    );
};

export default LoginPage;
