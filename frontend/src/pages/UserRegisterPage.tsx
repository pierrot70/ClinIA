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

type ManagedUser = {
    id: string;
    username: string;
    email: string | null;
    role: NewUserRole;
    isActive: boolean;
    createdAt?: string;
    lastLoginAt?: string | null;
};

type UsersListResponse = {
    data?: {
        users?: ManagedUser[];
    };
    error?: {
        code?: string;
        message?: string;
    };
};

const UserRegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const { authFetch, user: authUser } = useAuth();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<NewUserRole>("MEDECIN");
    const [saving, setSaving] = useState(false);
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [editUsername, setEditUsername] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editRole, setEditRole] = useState<NewUserRole>("MEDECIN");
    const [resetPassword, setResetPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadUsers = async () => {
        setLoadingUsers(true);
        setError(null);

        try {
            const response = await authFetch("/api/auth/users");
            const payload = (await response.json().catch(() => ({}))) as UsersListResponse;

            if (!response.ok) {
                setError(payload?.error?.message || "Impossible de lister les utilisateurs.");
                return;
            }

            setUsers(payload?.data?.users || []);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setError("Erreur reseau lors du chargement des utilisateurs.");
        } finally {
            setLoadingUsers(false);
        }
    };

    React.useEffect(() => {
        void loadUsers();
    }, []);

    const startEdit = (managedUser: ManagedUser) => {
        setSelectedUserId(managedUser.id);
        setEditUsername(managedUser.username);
        setEditEmail(managedUser.email || "");
        setEditRole(managedUser.role);
        setResetPassword("");
        setError(null);
        setSuccess(null);
    };

    const saveEdit = async () => {
        if (!selectedUserId) {
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await authFetch(`/api/auth/users/${selectedUserId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: editUsername,
                    email: editEmail.trim() || null,
                    role: editRole,
                }),
            });

            const payload = (await response.json().catch(() => ({}))) as RegisterResponse;
            if (!response.ok) {
                setError(payload?.error?.message || "Impossible de modifier l'utilisateur.");
                return;
            }

            setSuccess("Utilisateur mis a jour.");
            await loadUsers();
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setError("Erreur reseau.");
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (managedUser: ManagedUser) => {
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await authFetch(`/api/auth/users/${managedUser.id}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    isActive: !managedUser.isActive,
                }),
            });

            const payload = (await response.json().catch(() => ({}))) as RegisterResponse;
            if (!response.ok) {
                setError(payload?.error?.message || "Impossible de changer le statut.");
                return;
            }

            setSuccess(
                !managedUser.isActive
                    ? "Utilisateur active."
                    : "Utilisateur rendu inactif."
            );
            await loadUsers();
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setError("Erreur reseau.");
        } finally {
            setSaving(false);
        }
    };

    const applyResetPassword = async () => {
        if (!selectedUserId) {
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await authFetch(`/api/auth/users/${selectedUserId}/reset-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    newPassword: resetPassword,
                }),
            });

            const payload = (await response.json().catch(() => ({}))) as RegisterResponse;
            if (!response.ok) {
                setError(payload?.error?.message || "Impossible de reinitialiser le mot de passe.");
                return;
            }

            setSuccess("Mot de passe reinitialise.");
            setResetPassword("");
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setError("Erreur reseau.");
        } finally {
            setSaving(false);
        }
    };

    const removeUser = async (managedUser: ManagedUser) => {
        if (!window.confirm(`Supprimer l'utilisateur ${managedUser.username} ?`)) {
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await authFetch(`/api/auth/users/${managedUser.id}`, {
                method: "DELETE",
            });

            const payload = (await response.json().catch(() => ({}))) as RegisterResponse;
            if (!response.ok) {
                setError(payload?.error?.message || "Impossible de supprimer l'utilisateur.");
                return;
            }

            setSuccess("Utilisateur supprime.");
            if (selectedUserId === managedUser.id) {
                setSelectedUserId(null);
            }
            await loadUsers();
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setError("Erreur reseau.");
        } finally {
            setSaving(false);
        }
    };

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
            await loadUsers();
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
                Gestion utilisateurs reservee au SUPERADMIN: lister, editer, rendre inactif, reinitialiser ou supprimer.
            </p>

            {authUser?.role !== "SUPERADMIN" && (
                <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
                    Cette page est reservee au SUPERADMIN.
                </div>
            )}

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

            <div className="mt-8 rounded-xl border bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">Utilisateurs</h2>
                    <button
                        type="button"
                        onClick={() => {
                            void loadUsers();
                        }}
                        className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                    >
                        Rafraichir
                    </button>
                </div>

                {loadingUsers ? (
                    <p className="text-sm text-gray-500">Chargement des utilisateurs...</p>
                ) : users.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun utilisateur.</p>
                ) : (
                    <div className="space-y-3">
                        {users.map((managedUser) => (
                            <div
                                key={managedUser.id}
                                className="rounded-lg border border-gray-200 p-3"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900">
                                            {managedUser.username} ({managedUser.role})
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            {managedUser.email || "Aucun courriel"}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Statut: {managedUser.isActive ? "Actif" : "Inactif"}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => startEdit(managedUser)}
                                            className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
                                        >
                                            Editer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void toggleStatus(managedUser);
                                            }}
                                            className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800 hover:bg-amber-200"
                                        >
                                            {managedUser.isActive ? "Rendre inactif" : "Rendre actif"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void removeUser(managedUser);
                                            }}
                                            className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                                        >
                                            Effacer
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {selectedUserId && (
                <div className="mt-8 rounded-xl border bg-white p-5 space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">Edition utilisateur</h2>

                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="edit-username">
                            Nom d'utilisateur
                        </label>
                        <input
                            id="edit-username"
                            type="text"
                            value={editUsername}
                            onChange={(event) => setEditUsername(event.target.value)}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="edit-email">
                            Courriel
                        </label>
                        <input
                            id="edit-email"
                            type="email"
                            value={editEmail}
                            onChange={(event) => setEditEmail(event.target.value)}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="edit-role">
                            Role
                        </label>
                        <select
                            id="edit-role"
                            value={editRole}
                            onChange={(event) => setEditRole(event.target.value as NewUserRole)}
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
                        type="button"
                        onClick={() => {
                            void saveEdit();
                        }}
                        disabled={saving}
                        className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        Sauvegarder les modifications
                    </button>

                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="reset-password">
                            Nouveau mot de passe
                        </label>
                        <input
                            id="reset-password"
                            type="password"
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void applyResetPassword();
                        }}
                        disabled={saving}
                        className="w-full rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                        Reinitialiser le mot de passe
                    </button>
                </div>
            )}
        </div>
    );
};

export default UserRegisterPage;
