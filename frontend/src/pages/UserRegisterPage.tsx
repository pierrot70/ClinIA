import { UiMessage } from "../components/i18n/UiMessage";
import { useUiLabels } from "../hooks/useUiLabels";
import { translateUiLabelTree } from "../i18n/pageUiLabels";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { exceedsNewPasswordByteLimit } from "../auth/passwordPolicy";
import { passwordPolicyLabels } from "../i18n/passwordPolicyLabels";
import React, { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSensitiveReauthDialog } from "../hooks/useSensitiveReauthDialog";
import { SessionExpiredError } from "../services/authService";
import { labels } from "../i18n/uiLabels";
import {
    fetchCliniquesPaginated,
    type Clinique,
} from "../services/cliniqueApi";

const ROLE_OPTIONS = ["USER", "RECEPTION", "MEDECIN", "ADMIN", "SUPERADMIN"] as const;
const USER_ROLE_FILTER_OPTIONS = ["ALL", ...ROLE_OPTIONS] as const;
const PASSWORD_MIN_LENGTH = 12;

type NewUserRole = (typeof ROLE_OPTIONS)[number];
type UserRoleFilter = (typeof USER_ROLE_FILTER_OPTIONS)[number];

type AppliedUsersFilters = {
    search: string;
    role: UserRoleFilter;
};

type RegisterResponse = {
    data?: {
        user?: {
            id?: string;
            username?: string;
            email?: string | null;
            role?: NewUserRole;
            assignedClinics?: string[];
            mfaRequired?: boolean;
        };
        temporaryPassword?: string | null;
        data?: {
            temporaryPassword?: string | null;
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
    mfaRequired?: boolean;
    mfaEnabled?: boolean;
    assignedClinics?: string[];
};

type UsersListResponse = {
    data?: {
        users?: ManagedUser[];
        mfaPolicy?: {
            privilegedRolesRequired?: boolean;
        };
        pagination?: {
            page?: number;
            limit?: number;
            total?: number;
            totalPages?: number;
        };
    };
    error?: {
        code?: string;
        message?: string;
    };
};

const UserRegisterPage: React.FC = () => {
    const { locale: uiLocale, t } = useUiLabels();
    const navigate = useNavigate();
    const { authFetch, user: authUser } = useAuth();
    const { requestSensitiveReauth, sensitiveReauthModal } = useSensitiveReauthDialog();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const i18n = useContext(HomeI18nContext);
    const passwordTooLong = passwordPolicyLabels(i18n?.locale || "fr").tooLong;
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<NewUserRole>("MEDECIN");
    const [mfaRequired, setMfaRequired] = useState(false);
    const [assignedClinics, setAssignedClinics] = useState<string[]>([]);
    const [privilegedMfaRequired, setPrivilegedMfaRequired] = useState(false);
    const [saving, setSaving] = useState(false);
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [usersPage, setUsersPage] = useState(1);
    const [usersTotalPages, setUsersTotalPages] = useState(1);
    const [usersTotal, setUsersTotal] = useState(0);
    const [usersSearchInput, setUsersSearchInput] = useState("");
    const [usersRoleFilter, setUsersRoleFilter] = useState<UserRoleFilter>("ALL");
    const [appliedUsersSearch, setAppliedUsersSearch] = useState("");
    const [appliedUsersRoleFilter, setAppliedUsersRoleFilter] = useState<UserRoleFilter>("ALL");
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [editUsername, setEditUsername] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editRole, setEditRole] = useState<NewUserRole>("MEDECIN");
    const [editMfaRequired, setEditMfaRequired] = useState(false);
    const [editAssignedClinics, setEditAssignedClinics] = useState<string[]>([]);
    const [clinics, setClinics] = useState<Clinique[]>([]);
    const [resetPassword, setResetPassword] = useState("");
    const [temporaryPasswordResult, setTemporaryPasswordResult] = useState<string | null>(null);
    const [editSaveStatus, setEditSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
    const [editSaveMessage, setEditSaveMessage] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const USERS_PAGE_SIZE = 10;
    const isPrivilegedRole = (candidateRole: NewUserRole) =>
        candidateRole === "ADMIN" || candidateRole === "SUPERADMIN";
    const isMfaLockedForRole = (candidateRole: NewUserRole) =>
        privilegedMfaRequired && isPrivilegedRole(candidateRole);
    const effectiveMfaRequired = isMfaLockedForRole(role) || mfaRequired;
    const effectiveEditMfaRequired =
        isMfaLockedForRole(editRole) || editMfaRequired;
    const resetPasswordTooShort =
        resetPassword.length > 0 && resetPassword.length < PASSWORD_MIN_LENGTH;

    const toggleClinic = (
        clinicId: string,
        current: string[],
        update: (next: string[]) => void
    ) => {
        if (current.includes(clinicId)) {
            update(current.filter((value) => value !== clinicId));
            return;
        }
        if (current.length < 2) update([...current, clinicId]);
    };

    const ensureSensitiveAccess = async () => {
        return requestSensitiveReauth();
    };

    const loadUsers = async (
        page = usersPage,
        filters: AppliedUsersFilters = {
            search: appliedUsersSearch,
            role: appliedUsersRoleFilter,
        }
    ) => {
        setLoadingUsers(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(USERS_PAGE_SIZE),
            });

            if (filters.search.trim()) {
                params.set("search", filters.search.trim());
            }

            if (filters.role !== "ALL") {
                params.set("role", filters.role);
            }

            const response = await authFetch(
                `/api/auth/users?${params.toString()}`
            );
            const payload = (await response.json().catch(() => ({}))) as UsersListResponse;

            if (!response.ok) {
                if (payload?.error?.code === "REAUTH_REQUIRED") {
                    const reauthed = await ensureSensitiveAccess();
                    if (reauthed) {
                        await loadUsers(page, filters);
                    }
                    return;
                }
                setError(payload?.error?.message || labels.pageUi.impossibleDeListerLesUtilisateurs);
                return;
            }

            setUsers(payload?.data?.users || []);
            setPrivilegedMfaRequired(
                payload?.data?.mfaPolicy?.privilegedRolesRequired === true
            );
            setUsersPage(payload?.data?.pagination?.page || page);
            setUsersTotalPages(payload?.data?.pagination?.totalPages || 1);
            setUsersTotal(payload?.data?.pagination?.total || 0);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setError(labels.pageUi.erreurReseauLorsDuChargementDesUtilisateurs);
        } finally {
            setLoadingUsers(false);
        }
    };

    useEffect(() => {
        void loadUsers(usersPage);
    }, [usersPage]);

    useEffect(() => {
        void (async () => {
            const response = await fetchCliniquesPaginated({ limit: 50 });
            if (response.data) setClinics(response.data.data);
        })();
    }, []);

    const applyUsersFilters = () => {
        setSelectedUserId(null);

        const nextSearch = usersSearchInput.trim();
        const nextRole = usersRoleFilter;
        const nextFilters = {
            search: nextSearch,
            role: nextRole,
        };

        setAppliedUsersSearch(nextSearch);
        setAppliedUsersRoleFilter(nextRole);

        if (usersPage === 1) {
            void loadUsers(1, nextFilters);
            return;
        }

        setUsersPage(1);
    };

    const resetUsersFilters = () => {
        const resetFilters = {
            search: "",
            role: "ALL" as UserRoleFilter,
        };

        setUsersSearchInput("");
        setUsersRoleFilter("ALL");
        setAppliedUsersSearch(resetFilters.search);
        setAppliedUsersRoleFilter(resetFilters.role);
        setSelectedUserId(null);

        if (usersPage === 1) {
            void loadUsers(1, resetFilters);
            return;
        }

        setUsersPage(1);
    };

    useEffect(() => {
        if (!error && !success) {
            return;
        }

        const timerId = window.setTimeout(() => {
            setError(null);
            setSuccess(null);
        }, 3400);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [error, success]);

    useEffect(() => {
        if (editSaveStatus !== "success" && editSaveStatus !== "error") {
            return;
        }

        const timerId = window.setTimeout(() => {
            setEditSaveStatus("idle");
            setEditSaveMessage("");
        }, 3400);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [editSaveStatus]);

    const startEdit = (managedUser: ManagedUser) => {
        setSelectedUserId(managedUser.id);
        setEditUsername(managedUser.username);
        setEditEmail(managedUser.email || "");
        setEditRole(managedUser.role);
        setEditMfaRequired(managedUser.mfaRequired === true);
        setEditAssignedClinics(managedUser.assignedClinics || []);
        setResetPassword("");
        setTemporaryPasswordResult(null);
        setEditSaveStatus("idle");
        setEditSaveMessage("");
        setError(null);
        setSuccess(null);
    };

    const saveEdit = async () => {
        if (!selectedUserId) {
            return;
        }

        if (editRole === "RECEPTION" && editAssignedClinics.length === 0) {
            setEditSaveStatus("error");
            setEditSaveMessage(translateUiLabelTree(labels.auth.userManagement.receptionClinicsRequired, t));
            return;
        }

        setSaving(true);
        setEditSaveStatus("saving");
        setEditSaveMessage(labels.pageUi.sauvegardeEnCours);
        setError(null);
        setSuccess(null);

        const reauthed = await ensureSensitiveAccess();
        if (!reauthed) {
            setSaving(false);
            setEditSaveStatus("idle");
            setEditSaveMessage("");
            return;
        }

        try {
            const editedUsername = editUsername.trim();
            const response = await authFetch(`/api/auth/users/${selectedUserId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: editUsername,
                    email: editEmail.trim() || null,
                    role: editRole,
                    assignedClinics: editRole === "RECEPTION" ? editAssignedClinics : [],
                    mfaRequired: effectiveEditMfaRequired,
                }),
            });

            const payload = (await response.json().catch(() => ({}))) as RegisterResponse;
            if (!response.ok) {
                const failureMessage = payload?.error?.message || labels.pageUi.impossibleDeModifierLUtilisateur;
                setEditSaveStatus("error");
                setEditSaveMessage(labels.pageUi.saveFailed.replace("{message}", failureMessage));
                setError(failureMessage);
                return;
            }

            const successMessage = labels.pageUi.saveSucceeded.replace("{name}", editedUsername || labels.pageUi.cetUtilisateur);
            setEditSaveStatus("success");
            setEditSaveMessage(successMessage);
            setSuccess(successMessage);
            setSelectedUserId(null);
            setEditUsername("");
            setEditEmail("");
            setEditRole("MEDECIN");
            setEditMfaRequired(false);
            setEditAssignedClinics([]);
            await loadUsers(usersPage);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setEditSaveStatus("error");
            setEditSaveMessage(labels.pageUi.echecDeLaSauvegardeErreurReseau);
            setError(labels.pageUi.erreurReseau);
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (managedUser: ManagedUser) => {
        setSaving(true);
        setError(null);
        setSuccess(null);

        const reauthed = await ensureSensitiveAccess();
        if (!reauthed) {
            setSaving(false);
            return;
        }

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
                setError(payload?.error?.message || labels.pageUi.impossibleDeChangerLeStatut);
                return;
            }

            setSuccess(
                !managedUser.isActive
                    ? labels.pageUi.utilisateurActive
                    : labels.pageUi.utilisateurRenduInactif
            );
            await loadUsers(usersPage);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setError(labels.pageUi.erreurReseau);
        } finally {
            setSaving(false);
        }
    };

    const applyResetPassword = async () => {
        if (!selectedUserId) {
            return;
        }

        if (exceedsNewPasswordByteLimit(resetPassword)) {
            setEditSaveStatus("error");
            setEditSaveMessage(passwordTooLong);
            setError(passwordTooLong);
            return;
        }
        if (resetPasswordTooShort) {
            const message = translateUiLabelTree(labels.auth.userManagement.passwordMinLength, t);
            setEditSaveStatus("error");
            setEditSaveMessage(message);
            setError(message);
            return;
        }

        setSaving(true);
        setEditSaveStatus("saving");
        setEditSaveMessage(labels.pageUi.reinitialisationDuMotDePasseEnCours);
        setError(null);
        setSuccess(null);
        setTemporaryPasswordResult(null);

        const reauthed = await ensureSensitiveAccess();
        if (!reauthed) {
            setSaving(false);
            setEditSaveStatus("idle");
            setEditSaveMessage("");
            return;
        }

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
                const failureMessage =
                    payload?.error?.message ||
                    labels.pageUi.impossibleDeReinitialiserLeMotDePasse;
                setEditSaveStatus("error");
                setEditSaveMessage(labels.pageUi.resetFailed.replace("{message}", failureMessage));
                setError(failureMessage);
                return;
            }

            const temporaryPassword =
                payload?.data?.temporaryPassword ||
                payload?.data?.data?.temporaryPassword ||
                null;
            if (temporaryPassword) {
                const successMessage =
                    labels.pageUi.temporaryPassword.replace("{password}", temporaryPassword) +
                    labels.pageUi.lUtilisateurDevraLeRemplacerALaPremiereConnexion;
                setTemporaryPasswordResult(temporaryPassword);
                setEditSaveStatus("success");
                setEditSaveMessage(successMessage);
                setSuccess(successMessage);
            } else {
                const successMessage = translateUiLabelTree(labels.auth.userManagement.passwordResetCompleted, t);
                setEditSaveStatus("success");
                setEditSaveMessage(successMessage);
                setSuccess(successMessage);
            }
            setResetPassword("");
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setEditSaveStatus("error");
            setEditSaveMessage(labels.pageUi.echecDeLaReinitialisationErreurReseau);
            setError(labels.pageUi.erreurReseau);
        } finally {
            setSaving(false);
        }
    };

    const removeUser = async (managedUser: ManagedUser) => {
        if (!window.confirm(t(labels.pageUi.deleteUser).replace("{name}", managedUser.username))) {
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        const reauthed = await ensureSensitiveAccess();
        if (!reauthed) {
            setSaving(false);
            return;
        }

        try {
            const response = await authFetch(`/api/auth/users/${managedUser.id}`, {
                method: "DELETE",
            });

            const payload = (await response.json().catch(() => ({}))) as RegisterResponse;
            if (!response.ok) {
                setError(payload?.error?.message || labels.pageUi.impossibleDeSupprimerLUtilisateur);
                return;
            }

            setSuccess(labels.pageUi.utilisateurSupprime);
            if (selectedUserId === managedUser.id) {
                setSelectedUserId(null);
            }
            await loadUsers(usersPage);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }
            setError(labels.pageUi.erreurReseau);
        } finally {
            setSaving(false);
        }
    };

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (exceedsNewPasswordByteLimit(password)) {
            setError(passwordTooLong);
            return;
        }
        if (role === "RECEPTION" && assignedClinics.length === 0) {
            setError(translateUiLabelTree(labels.auth.userManagement.receptionClinicsRequired, t));
            return;
        }
        setSaving(true);
        setError(null);
        setSuccess(null);

        const reauthed = await ensureSensitiveAccess();
        if (!reauthed) {
            setSaving(false);
            return;
        }

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
                    assignedClinics: role === "RECEPTION" ? assignedClinics : [],
                    mfaRequired: effectiveMfaRequired,
                }),
            });

            const payload = (await response.json().catch(() => ({}))) as RegisterResponse;

            if (!response.ok) {
                setError(
                    payload?.error?.message ||
                        labels.pageUi.impossibleDeCreerLUtilisateur
                );
                return;
            }

            setSuccess(
                labels.pageUi.userCreated.replace("{name}", payload?.data?.user?.username || username)
            );
            setUsername("");
            setEmail("");
            setPassword("");
            setRole("MEDECIN");
            setMfaRequired(false);
            setAssignedClinics([]);
            await loadUsers(1);
        } catch (err) {
            if (err instanceof SessionExpiredError) {
                navigate("/admin/login", { replace: true });
                return;
            }

            setError(labels.pageUi.erreurReseauReessayez);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">
                    {t(labels.pageUi.creationDUnUtilisateur)}</h1>
                <Link
                    to="/mock-studio"
                    className="text-sm text-blue-600 hover:text-blue-700"
                >
                    {t(labels.pageUi.retourMockStudio)}</Link>
            </div>

            <p className="mb-6 text-sm text-gray-600">
                {t(labels.pageUi.gestionUtilisateursReserveeAuSUPERADMINListerEditerRendreInactifReinit)}</p>

            {authUser?.role !== "SUPERADMIN" && (
                <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
                    {t(labels.pageUi.cettePageEstReserveeAuSUPERADMIN)}</div>
            )}

            {error && (
                <div className="clinia-fade-feedback mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
                    <UiMessage message={error} />
                </div>
            )}

            {success && (
                <div className="clinia-fade-feedback mb-4 rounded bg-green-50 p-3 text-sm text-green-700">
                    {t(success)}
                </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-5">
                <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="username">
                        {t(labels.pageUi.nomDUtilisateur)}</label>
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
                        {t(labels.pageUi.courrielOptionnel)}</label>
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
                        {t(labels.pageUi.motDePasse)}</label>
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
                        {t(labels.pageUi.role)}</label>
                    <select
                        id="role"
                        value={role}
                        onChange={(event) => {
                            const nextRole = event.target.value as NewUserRole;
                            setRole(nextRole);
                            if (nextRole !== "RECEPTION") setAssignedClinics([]);
                        }}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                        {ROLE_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </div>

                {role === "RECEPTION" && (
                    <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <legend className="px-1 text-sm font-medium text-gray-800">{translateUiLabelTree(labels.auth.userManagement.receptionClinicsLabel, t)}</legend>
                        <p className="mb-2 text-xs text-gray-600">{translateUiLabelTree(labels.auth.userManagement.receptionClinicsHelp, t)}</p>
                        <div className="space-y-1">
                            {clinics.map((clinic) => (
                                <label key={clinic._id} className="flex items-center gap-2 text-sm text-gray-800">
                                    <input type="checkbox" checked={assignedClinics.includes(clinic._id)} disabled={!assignedClinics.includes(clinic._id) && assignedClinics.length >= 2} onChange={() => toggleClinic(clinic._id, assignedClinics, setAssignedClinics)} />
                                    {clinic.nom}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                )}

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-start gap-2 text-sm font-medium text-gray-800" htmlFor="mfa-required">
                        <input
                            id="mfa-required"
                            type="checkbox"
                            checked={effectiveMfaRequired}
                            disabled={isMfaLockedForRole(role)}
                            onChange={(event) => setMfaRequired(event.target.checked)}
                            className="mt-0.5 h-4 w-4"
                        />
                        <span>{translateUiLabelTree(labels.auth.userManagement.mfaRequiredLabel, t)}</span>
                    </label>
                    <p className="mt-1 text-xs text-gray-600">
                        {isMfaLockedForRole(role)
                            ? translateUiLabelTree(labels.auth.userManagement.mfaPrivilegedRequired, t)
                            : translateUiLabelTree(labels.auth.userManagement.mfaRequiredHelp, t)}
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? t(labels.pageUi.creating) : t(labels.pageUi.creerLUtilisateur)}
                </button>
            </form>

            <div className="mt-8 rounded-xl border bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">{t(labels.pageUi.utilisateurs)}</h2>
                    <button
                        type="button"
                        onClick={() => {
                            void loadUsers(usersPage);
                        }}
                        className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                    >
                        {t(labels.pageUi.rafraichir)}</button>
                </div>

                <div className="mb-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                    <span>{t(labels.pageUi.userCount).replace("{count}", usersTotal.toLocaleString(uiLocale))}</span>
                    <span>{t(labels.pageUi.page)} {usersPage} / {Math.max(1, usersTotalPages)}</span>
                </div>

                <form
                    className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto_auto]"
                    onSubmit={(event) => {
                        event.preventDefault();
                        applyUsersFilters();
                    }}
                >
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="users-search">
                            {t(labels.pageUi.filtrerLesUtilisateurs)}</label>
                        <input
                            id="users-search"
                            type="text"
                            value={usersSearchInput}
                            onChange={(event) => setUsersSearchInput(event.target.value)}
                            placeholder={t(labels.pageUi.nomDUtilisateurOuCourriel)}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="users-role-filter">
                            {t(labels.pageUi.role)}</label>
                        <select
                            id="users-role-filter"
                            value={usersRoleFilter}
                            onChange={(event) => setUsersRoleFilter(event.target.value as UserRoleFilter)}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        >
                            {USER_ROLE_FILTER_OPTIONS.map((value) => (
                                <option key={value} value={value}>
                                    {value === "ALL" ? t(labels.pageUi.tousLesRoles) : value}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="submit"
                        className="self-end rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        {t(labels.pageUi.filtrer)}</button>

                    <button
                        type="button"
                        onClick={resetUsersFilters}
                        className="self-end rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        {t(labels.pageUi.reinitialiser2)}</button>
                </form>

                {editSaveStatus !== "idle" && (
                    <div
                        className={
                            "mb-3 rounded border px-3 py-2 text-sm " +
                            (editSaveStatus === "success"
                                ? "border-green-200 bg-green-50 text-green-800"
                                : editSaveStatus === "error"
                                    ? "border-red-200 bg-red-50 text-red-800"
                                    : "border-blue-200 bg-blue-50 text-blue-800") +
                            (editSaveStatus === "success" || editSaveStatus === "error"
                                ? " clinia-fade-feedback"
                                : "")
                        }
                        role="status"
                        aria-live="polite"
                    >
                        <span className="mr-2 font-semibold" aria-hidden="true">
                            {editSaveStatus === "success"
                                ? "✓"
                                : editSaveStatus === "error"
                                    ? "✕"
                                    : "..."}
                        </span>
                        <span>{t(editSaveMessage)}</span>
                    </div>
                )}

                <p className="mb-3 text-xs text-gray-500">
                    {t(labels.pageUi.cliquezSur)}{" "}<span className="font-semibold text-blue-700">{t(labels.pageUi.modifier)}</span> {" "}{t(labels.pageUi.pourOuvrirLePanneauDEditionDUnUtilisateur)}</p>

                {loadingUsers ? (
                    <p className="text-sm text-gray-500">{t(labels.pageUi.chargementDesUtilisateurs)}</p>
                ) : users.length === 0 ? (
                    <p className="text-sm text-gray-500">{t(labels.pageUi.aucunUtilisateur)}</p>
                ) : (
                    <div className="space-y-3">
                        {users.map((managedUser) => (
                            <div
                                key={managedUser.id}
                                className={
                                    "rounded-lg border p-3 " +
                                    (selectedUserId === managedUser.id
                                        ? "border-blue-300 bg-blue-50/40"
                                        : "border-gray-200")
                                }
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900">
                                            {managedUser.username} ({managedUser.role})
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            {managedUser.email || t(labels.pageUi.aucunCourriel)}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {t(labels.pageUi.statut)}{managedUser.isActive ? t(labels.pageUi.active) : t(labels.pageUi.inactive)}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {t(labels.pageUi.mFA)}{managedUser.mfaEnabled
                                                ? translateUiLabelTree(labels.auth.userManagement.mfaStatusEnabled, t)
                                                : managedUser.mfaRequired
                                                    ? translateUiLabelTree(labels.auth.userManagement.mfaStatusRequired, t)
                                                    : translateUiLabelTree(labels.auth.userManagement.mfaStatusDisabled, t)}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => startEdit(managedUser)}
                                            className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                                        >
                                            {selectedUserId === managedUser.id ? t(labels.pageUi.modificationOuverte) : t(labels.pageUi.modifier)}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void toggleStatus(managedUser);
                                            }}
                                            className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800 hover:bg-amber-200"
                                        >
                                            {managedUser.isActive ? t(labels.pageUi.rendreInactif) : t(labels.pageUi.rendreActif)}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void removeUser(managedUser);
                                            }}
                                            className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                                        >
                                            {t(labels.pageUi.effacer)}</button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                            <button
                                type="button"
                                onClick={() => setUsersPage((current) => Math.max(current - 1, 1))}
                                disabled={loadingUsers || usersPage <= 1}
                                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
                            >
                                {t(labels.pageUi.precedent3)}</button>
                            <button
                                type="button"
                                onClick={() =>
                                    setUsersPage((current) => Math.min(current + 1, Math.max(1, usersTotalPages)))
                                }
                                disabled={loadingUsers || usersPage >= usersTotalPages}
                                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 disabled:opacity-50"
                            >
                                {t(labels.pageUi.suivant2)}</button>
                        </div>
                    </div>
                )}
            </div>

            {selectedUserId && (
                <div className="mt-8 rounded-xl border bg-white p-5 space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">{t(labels.pageUi.editionUtilisateur)}</h2>

                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="edit-username">
                            {t(labels.pageUi.nomDUtilisateur)}</label>
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
                            {t(labels.pageUi.courriel)}</label>
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
                            {t(labels.pageUi.role)}</label>
                        <select
                        id="edit-role"
                        value={editRole}
                        onChange={(event) => {
                            const nextRole = event.target.value as NewUserRole;
                            setEditRole(nextRole);
                            if (nextRole !== "RECEPTION") setEditAssignedClinics([]);
                        }}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        >
                            {ROLE_OPTIONS.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                    </select>
                </div>

                {editRole === "RECEPTION" && (
                    <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <legend className="px-1 text-sm font-medium text-gray-800">{translateUiLabelTree(labels.auth.userManagement.receptionClinicsLabel, t)}</legend>
                        <p className="mb-2 text-xs text-gray-600">{translateUiLabelTree(labels.auth.userManagement.receptionClinicsHelp, t)}</p>
                        <div className="space-y-1">
                            {clinics.map((clinic) => (
                                <label key={clinic._id} className="flex items-center gap-2 text-sm text-gray-800">
                                    <input type="checkbox" checked={editAssignedClinics.includes(clinic._id)} disabled={!editAssignedClinics.includes(clinic._id) && editAssignedClinics.length >= 2} onChange={() => toggleClinic(clinic._id, editAssignedClinics, setEditAssignedClinics)} />
                                    {clinic.nom}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                )}

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="flex items-start gap-2 text-sm font-medium text-gray-800" htmlFor="edit-mfa-required">
                            <input
                                id="edit-mfa-required"
                                type="checkbox"
                                checked={effectiveEditMfaRequired}
                                disabled={isMfaLockedForRole(editRole)}
                                onChange={(event) => setEditMfaRequired(event.target.checked)}
                                className="mt-0.5 h-4 w-4"
                            />
                            <span>{translateUiLabelTree(labels.auth.userManagement.mfaRequiredLabel, t)}</span>
                        </label>
                        <p className="mt-1 text-xs text-gray-600">
                            {isMfaLockedForRole(editRole)
                                ? translateUiLabelTree(labels.auth.userManagement.mfaPrivilegedRequired, t)
                                : translateUiLabelTree(labels.auth.userManagement.mfaRequiredHelp, t)}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void saveEdit();
                        }}
                        disabled={saving}
                        className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {t(labels.pageUi.sauvegarderLesModifications)}</button>

                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div>
                            <h3 className="text-sm font-semibold text-amber-950">
                                {translateUiLabelTree(labels.auth.userManagement.passwordSectionTitle, t)}
                            </h3>
                            <p className="mt-1 text-xs text-amber-900">
                                {translateUiLabelTree(labels.auth.userManagement.passwordSectionHelp, t)}
                            </p>
                        </div>
                        <label className="block text-xs font-semibold text-gray-700" htmlFor="reset-password">
                            {translateUiLabelTree(labels.auth.userManagement.passwordLabel, t)}
                        </label>
                        <input
                            id="reset-password"
                            type="password"
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            minLength={PASSWORD_MIN_LENGTH}
                            aria-describedby="reset-password-help"
                            placeholder={translateUiLabelTree(labels.auth.userManagement.passwordPlaceholder, t)}
                        />
                        {resetPasswordTooShort ? (
                            <p className="text-xs font-medium text-red-700" id="reset-password-help">
                                {translateUiLabelTree(labels.auth.userManagement.passwordMinLength, t)}
                            </p>
                        ) : (
                            <p className="text-xs text-amber-900" id="reset-password-help">
                                {translateUiLabelTree(labels.auth.userManagement.passwordTemporaryHelp, t)}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                void applyResetPassword();
                            }}
                            disabled={saving || resetPasswordTooShort}
                            className="w-full rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {resetPassword
                                ? translateUiLabelTree(labels.auth.userManagement.passwordSetAction, t)
                                : translateUiLabelTree(labels.auth.userManagement.passwordGenerateAction, t)}
                        </button>
                    </div>

                    {temporaryPasswordResult && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                            <div className="font-semibold">{t(labels.pageUi.motDePasseTemporaireGenere)}</div>
                            <div className="mt-2 break-all rounded bg-white px-3 py-2 font-mono text-emerald-950">
                                {temporaryPasswordResult}
                            </div>
                            <div className="mt-2 text-xs text-emerald-900">
                                {t(labels.pageUi.communiquezCeMotDePasseTemporaireALUtilisateurParUnCanalControleIlDevr)}</div>
                        </div>
                    )}

                </div>
            )}
        </div>
        {sensitiveReauthModal}
        </>
    );
};

export default UserRegisterPage;
