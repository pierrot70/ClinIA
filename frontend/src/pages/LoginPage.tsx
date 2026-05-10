import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getDefaultRouteForRole, isAdminRole, type UserRole } from "../auth/roles";
import { useAuth } from "../hooks/useAuth";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { useTranslation } from "../hooks/useTranslation";
import { labels } from "../i18n/uiLabels";
import { consumeAuthSecurityNotice, type AuthSecurityNotice } from "../services/authService";

type LoginPageProps = {
    adminOnly?: boolean;
};

function useLoginLabel(text: string) {
    const { locale } = useHomeI18n();
    return useTranslation({
        text,
        targetLang: locale,
        namespace: "login",
    }).translated;
}

const LoginPage: React.FC<LoginPageProps> = ({ adminOnly = false }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [registerMode, setRegisterMode] = useState(false);
    const [registerRole, setRegisterRole] = useState<UserRole>("USER");
    const [error, setError] = useState<string | null>(null);
    const [securityNotice, setSecurityNotice] = useState<AuthSecurityNotice | null>(null);
    const [loading, setLoading] = useState(false);

    const location = useLocation();
    const navigate = useNavigate();
    const { isAuthenticated, user, login, registerSelf, logout, passwordResetRequired } = useAuth();
    const loginLabels = labels.loginPage;
    const titleAdmin = useLoginLabel(loginLabels.title.admin);
    const titleRegister = useLoginLabel(loginLabels.title.register);
    const titleLogin = useLoginLabel(loginLabels.title.login);
    const descriptionAdmin = useLoginLabel(loginLabels.description.admin);
    const descriptionRegister = useLoginLabel(loginLabels.description.register);
    const descriptionLogin = useLoginLabel(loginLabels.description.login);
    const alreadyHaveAccountLabel = useLoginLabel(loginLabels.modeToggle.alreadyHaveAccount);
    const createAccountModeLabel = useLoginLabel(loginLabels.modeToggle.createAccount);
    const emailLabel = useLoginLabel(loginLabels.fields.email);
    const identifierLabel = useLoginLabel(loginLabels.fields.identifier);
    const passwordLabel = useLoginLabel(loginLabels.fields.password);
    const accountRoleLabel = useLoginLabel(loginLabels.fields.accountRole);
    const creatingLabel = useLoginLabel(loginLabels.action.creating);
    const loggingInLabel = useLoginLabel(loginLabels.action.loggingIn);
    const createAccountLabel = useLoginLabel(loginLabels.action.createAccount);
    const loginActionLabel = useLoginLabel(loginLabels.action.login);
    const adminOnlyErrorLabel = useLoginLabel(loginLabels.errors.adminOnly);
    const createFailedLabel = useLoginLabel(loginLabels.errors.createFailed);
    const loginFailedLabel = useLoginLabel(loginLabels.errors.loginFailed);
    const revokedTitleLabel = useLoginLabel(labels.auth.session.revokedTitle);
    const revokedBodyLabel = useLoginLabel(labels.auth.session.revokedBody);
    const restrictedTitleLabel = useLoginLabel(labels.auth.session.restrictedTitle);
    const restrictedBodyLabel = useLoginLabel(labels.auth.session.restrictedBody);
    const restrictedUntilPrefixLabel = useLoginLabel(labels.auth.session.restrictedUntilPrefix);

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

    useEffect(() => {
        setSecurityNotice(consumeAuthSecurityNotice());
    }, []);

    if (isAuthenticated && user) {
        if (passwordResetRequired) {
            return <Navigate to="/security/password-reset-required" replace />;
        }

        if (adminOnly && !isAdminRole(user.role)) {
            return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
        }

        return <Navigate to={redirectTarget} replace />;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setSecurityNotice(null);

        try {
            const session = registerMode && !adminOnly
                ? await registerSelf({ email, password, role: registerRole })
                : await login({ email, password });

            if (adminOnly && !isAdminRole(session.user.role)) {
                await logout();
                setError(adminOnlyErrorLabel);
                return;
            }

            const from = (location.state as { from?: string } | null)?.from;
            const destination =
                session.user.passwordResetRequired
                    ? "/security/password-reset-required"
                    : typeof from === "string" && from.trim().length > 0
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
                        ? createFailedLabel
                        : loginFailedLabel
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
                    ? titleAdmin
                    : registerMode
                        ? titleRegister
                        : titleLogin}
            </h1>
            <p className="text-sm text-gray-600 mb-6">
                {adminOnly
                    ? descriptionAdmin
                    : registerMode
                        ? descriptionRegister
                        : descriptionLogin}
            </p>

            {securityNotice && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold">
                        {securityNotice.code === "ACCOUNT_TEMPORARILY_RESTRICTED"
                            ? restrictedTitleLabel
                            : revokedTitleLabel}
                    </p>
                    <p className="mt-1">
                        {securityNotice.code === "ACCOUNT_TEMPORARILY_RESTRICTED"
                            ? restrictedBodyLabel
                            : revokedBodyLabel}
                    </p>
                    {securityNotice.code === "ACCOUNT_TEMPORARILY_RESTRICTED" &&
                        securityNotice.restrictedUntil && (
                            <p className="mt-2 text-xs font-medium text-amber-800">
                                {restrictedUntilPrefixLabel} {securityNotice.restrictedUntil}
                            </p>
                        )}
                </div>
            )}

            {!adminOnly && (
                <button
                    type="button"
                    onClick={() => setRegisterMode((prev) => !prev)}
                    className="mb-4 text-sm text-blue-600 hover:text-blue-700"
                >
                    {registerMode
                        ? alreadyHaveAccountLabel
                        : createAccountModeLabel}
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
                            ? emailLabel
                            : identifierLabel}
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
                        {passwordLabel}
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
                            {accountRoleLabel}
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
                            <option value="USER">USER</option>
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
                            ? creatingLabel
                            : loggingInLabel
                        : registerMode && !adminOnly
                            ? createAccountLabel
                            : loginActionLabel}
                </button>
            </form>
        </div>
    );
};

export default LoginPage;
