import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getDefaultRouteForRole, isAdminRole, type UserRole } from "../auth/roles";
import { useAuth } from "../hooks/useAuth";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { useTranslation } from "../hooks/useTranslation";
import { labels } from "../i18n/uiLabels";
import {
    completePasswordRecovery,
    consumeAuthSecurityNotice,
    MfaRequiredError,
    MfaVerificationError,
    type MfaChallenge,
    requestPasswordRecovery,
    type AuthSecurityNotice,
    verifyPasswordRecoveryCode,
} from "../services/authService";

type LoginPageProps = {
    adminOnly?: boolean;
};

type RecoveryStep = "request" | "verify" | "complete";

function useLoginLabel(text: string, translationKey: string) {
    const { locale } = useHomeI18n();
    return useTranslation({
        text,
        targetLang: locale,
        namespace: "login",
        translationKey,
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
    const [recoveryMode, setRecoveryMode] = useState(false);
    const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("request");
    const [recoveryCode, setRecoveryCode] = useState("");
    const [recoveryGrant, setRecoveryGrant] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [success, setSuccess] = useState<string | null>(null);
    const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
    const [mfaCode, setMfaCode] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const enrollmentCompletionPendingRef = useRef(false);

    const location = useLocation();
    const navigate = useNavigate();
    const {
        isAuthenticated,
        user,
        login,
        completeMfaLogin,
        registerSelf,
        logout,
        passwordResetRequired,
        mustChangePasswordOnNextLogin,
    } = useAuth();
    const loginLabels = labels.loginPage;
    const titleAdmin = useLoginLabel(loginLabels.title.admin, "login.title.admin");
    const titleRegister = useLoginLabel(loginLabels.title.register, "login.title.register");
    const titleLogin = useLoginLabel(loginLabels.title.login, "login.title.login");
    const descriptionAdmin = useLoginLabel(loginLabels.description.admin, "login.description.admin");
    const descriptionRegister = useLoginLabel(loginLabels.description.register, "login.description.register");
    const descriptionLogin = useLoginLabel(loginLabels.description.login, "login.description.login");
    const alreadyHaveAccountLabel = useLoginLabel(loginLabels.modeToggle.alreadyHaveAccount, "login.modeToggle.alreadyHaveAccount");
    const createAccountModeLabel = useLoginLabel(loginLabels.modeToggle.createAccount, "login.modeToggle.createAccount");
    const emailLabel = useLoginLabel(loginLabels.fields.email, "login.fields.email");
    const identifierLabel = useLoginLabel(loginLabels.fields.identifier, "login.fields.identifier");
    const passwordLabel = useLoginLabel(loginLabels.fields.password, "login.fields.password");
    const accountRoleLabel = useLoginLabel(loginLabels.fields.accountRole, "login.fields.accountRole");
    const creatingLabel = useLoginLabel(loginLabels.action.creating, "login.action.creating");
    const loggingInLabel = useLoginLabel(loginLabels.action.loggingIn, "login.action.loggingIn");
    const createAccountLabel = useLoginLabel(loginLabels.action.createAccount, "login.action.createAccount");
    const loginActionLabel = useLoginLabel(loginLabels.action.login, "login.action.login");
    const forgotPasswordLabel = useLoginLabel(loginLabels.action.forgotPassword, "login.action.forgotPassword");
    const adminOnlyErrorLabel = useLoginLabel(loginLabels.errors.adminOnly, "login.errors.adminOnly");
    const createFailedLabel = useLoginLabel(loginLabels.errors.createFailed, "login.errors.createFailed");
    const loginFailedLabel = useLoginLabel(loginLabels.errors.loginFailed, "login.errors.loginFailed");
    const recoveryLabels = loginLabels.recovery;
    const recoveryEmailLabel = useLoginLabel(recoveryLabels.emailLabel, "login.recovery.emailLabel");
    const recoveryVerificationCodeLabel = useLoginLabel(recoveryLabels.verificationCodeLabel, "login.recovery.verificationCodeLabel");
    const recoveryNewPasswordLabel = useLoginLabel(recoveryLabels.newPasswordLabel, "login.recovery.newPasswordLabel");
    const recoveryConfirmPasswordLabel = useLoginLabel(recoveryLabels.confirmPasswordLabel, "login.recovery.confirmPasswordLabel");
    const recoveryProcessingLabel = useLoginLabel(recoveryLabels.processing, "login.recovery.processing");
    const recoverySendCodeLabel = useLoginLabel(recoveryLabels.sendCode, "login.recovery.sendCode");
    const recoveryVerifyCodeLabel = useLoginLabel(recoveryLabels.verifyCode, "login.recovery.verifyCode");
    const recoveryChangePasswordLabel = useLoginLabel(recoveryLabels.changePassword, "login.recovery.changePassword");
    const recoveryBackToLoginLabel = useLoginLabel(recoveryLabels.backToLogin, "login.recovery.backToLogin");
    const recoveryRequestSentLabel = useLoginLabel(recoveryLabels.requestSent, "login.recovery.requestSent");
    const recoveryCodeVerifiedLabel = useLoginLabel(recoveryLabels.codeVerified, "login.recovery.codeVerified");
    const recoveryPasswordsMismatchLabel = useLoginLabel(recoveryLabels.passwordsMismatch, "login.recovery.passwordsMismatch");
    const recoveryPasswordChangedLabel = useLoginLabel(recoveryLabels.passwordChanged, "login.recovery.passwordChanged");
    const recoveryContinueFailedLabel = useLoginLabel(recoveryLabels.continueFailed, "login.recovery.continueFailed");
    const revokedTitleLabel = useLoginLabel(labels.auth.session.revokedTitle, "auth.session.revokedTitle");
    const revokedBodyLabel = useLoginLabel(labels.auth.session.revokedBody, "auth.session.revokedBody");
    const replacedTitleLabel = useLoginLabel(labels.auth.session.replacedTitle, "auth.session.replacedTitle");
    const replacedBodyLabel = useLoginLabel(labels.auth.session.replacedBody, "auth.session.replacedBody");
    const replacedActionLabel = useLoginLabel(labels.auth.session.replacedAction, "auth.session.replacedAction");
    const restrictedTitleLabel = useLoginLabel(labels.auth.session.restrictedTitle, "auth.session.restrictedTitle");
    const restrictedBodyLabel = useLoginLabel(labels.auth.session.restrictedBody, "auth.session.restrictedBody");
    const restrictedUntilPrefixLabel = useLoginLabel(labels.auth.session.restrictedUntilPrefix, "auth.session.restrictedUntilPrefix");
    const mfaLabels = loginLabels.mfa;

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

    if (isAuthenticated && user && !enrollmentCompletionPendingRef.current) {
        if (passwordResetRequired) {
            return <Navigate to="/security/password-reset-required" replace />;
        }

        if (mustChangePasswordOnNextLogin) {
            return <Navigate to="/security/change-password-required" replace />;
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
                    : session.user.mustChangePasswordOnNextLogin
                    ? "/security/change-password-required"
                    : typeof from === "string" && from.trim().length > 0
                    ? from
                    : adminOnly
                        ? getDefaultRouteForRole(session.user.role)
                        : "/";

            navigate(destination, { replace: true });
        } catch (err: unknown) {
            if (err instanceof MfaRequiredError) {
                setMfaChallenge(err.challenge);
                setMfaCode("");
                return;
            }
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

    const handleMfaSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!mfaChallenge) return;
        setLoading(true);
        setError(null);
        enrollmentCompletionPendingRef.current = mfaChallenge.enrollmentRequired;
        try {
            const result = await completeMfaLogin(mfaChallenge, mfaCode);
            setRecoveryCodes(result.recoveryCodes);
            if (result.recoveryCodes.length === 0) {
                enrollmentCompletionPendingRef.current = false;
                navigate(adminOnly ? getDefaultRouteForRole(result.session.user.role) : "/", { replace: true });
            }
        } catch (err) {
            enrollmentCompletionPendingRef.current = false;
            if (
                err instanceof MfaVerificationError &&
                ["INVALID_MFA_CHALLENGE", "MFA_TEMPORARILY_LOCKED"].includes(err.code)
            ) {
                setMfaChallenge(null);
                setMfaCode("");
                setError(
                    err.code === "MFA_TEMPORARILY_LOCKED"
                        ? mfaLabels.temporarilyLocked
                        : mfaLabels.challengeExpiredRestart
                );
                return;
            }
            setError(err instanceof Error ? err.message : loginFailedLabel);
        } finally {
            setLoading(false);
        }
    };

    const resetRecovery = () => {
        setRecoveryMode(false);
        setRecoveryStep("request");
        setRecoveryCode("");
        setRecoveryGrant("");
        setNewPassword("");
        setConfirmPassword("");
        setError(null);
        setSuccess(null);
    };

    const handleRecoverySubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (recoveryStep === "request") {
                await requestPasswordRecovery(email);
                setRecoveryStep("verify");
                setSuccess(recoveryRequestSentLabel);
                return;
            }

            if (recoveryStep === "verify") {
                const grant = await verifyPasswordRecoveryCode(email, recoveryCode);
                setRecoveryGrant(grant);
                setRecoveryStep("complete");
                setSuccess(recoveryCodeVerifiedLabel);
                return;
            }

            if (newPassword !== confirmPassword) {
                setError(recoveryPasswordsMismatchLabel);
                return;
            }

            await completePasswordRecovery(email, recoveryGrant, newPassword);
            resetRecovery();
            setEmail(email);
            setSuccess(recoveryPasswordChangedLabel);
        } catch (err: unknown) {
            setError(
                err instanceof Error && err.message
                    ? err.message
                    : recoveryContinueFailedLabel
            );
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

            {securityNotice && securityNotice.code !== "SESSION_REPLACED" && (
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

            {securityNotice?.code === "SESSION_REPLACED" && (
                <div
                    className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/75 px-4"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="session-replaced-title"
                >
                    <section className="w-full max-w-2xl rounded-xl border border-amber-300 bg-white p-8 text-center shadow-2xl">
                        <h2 id="session-replaced-title" className="text-2xl font-semibold text-slate-950">
                            {replacedTitleLabel}
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-700">
                            {replacedBodyLabel}
                        </p>
                        <button
                            type="button"
                            onClick={() => setSecurityNotice(null)}
                            className="mt-7 rounded bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            {replacedActionLabel}
                        </button>
                    </section>
                </div>
            )}

            {!adminOnly && !recoveryMode && (
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

            {success && (
                <div className="mb-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700">
                    {success}
                </div>
            )}

            {recoveryCodes.length > 0 ? (
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">{mfaLabels.recoveryCodesTitle}</h2>
                    <p className="text-sm text-gray-600">{mfaLabels.recoveryCodesDescription}</p>
                    <pre className="rounded border bg-gray-50 p-3 text-sm whitespace-pre-wrap">{recoveryCodes.join("\n")}</pre>
                    <button type="button" onClick={() => navigate(adminOnly ? "/mock-studio" : "/", { replace: true })} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white">{mfaLabels.continue}</button>
                </div>
            ) : mfaChallenge ? (
                <form onSubmit={handleMfaSubmit} className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">{mfaLabels.title}</h2>
                    <p className="text-sm text-gray-600">{mfaChallenge.enrollmentRequired ? mfaLabels.enrollmentDescription : mfaLabels.description}</p>
                    {mfaChallenge.enrollmentRequired && mfaChallenge.manualEntryKey && <div className="rounded border bg-gray-50 p-3 text-sm"><strong>{mfaLabels.manualEntryKey}:</strong><br /><code className="break-all">{mfaChallenge.manualEntryKey}</code></div>}
                    <div><label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="mfa-code">{mfaLabels.codeLabel}</label><input id="mfa-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" className="w-full border rounded-lg px-3 py-2 text-sm" required /></div>
                    <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50">{mfaLabels.verify}</button>
                </form>
            ) : recoveryMode ? (
                <form onSubmit={handleRecoverySubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="recovery-email">
                            {recoveryEmailLabel}
                        </label>
                        <input
                            id="recovery-email"
                            type="email"
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            disabled={recoveryStep !== "request"}
                            required
                        />
                    </div>

                    {recoveryStep === "verify" && (
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="recovery-code">
                                {recoveryVerificationCodeLabel}
                            </label>
                            <input
                                id="recovery-code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                className="w-full rounded-lg border px-3 py-2 text-sm"
                                value={recoveryCode}
                                onChange={(event) =>
                                    setRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                                }
                                autoComplete="one-time-code"
                                required
                            />
                        </div>
                    )}

                    {recoveryStep === "complete" && (
                        <>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="recovery-new-password">
                                    {recoveryNewPasswordLabel}
                                </label>
                                <input
                                    id="recovery-new-password"
                                    type="password"
                                    minLength={8}
                                    maxLength={128}
                                    className="w-full rounded-lg border px-3 py-2 text-sm"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="recovery-confirm-password">
                                    {recoveryConfirmPasswordLabel}
                                </label>
                                <input
                                    id="recovery-confirm-password"
                                    type="password"
                                    minLength={8}
                                    maxLength={128}
                                    className="w-full rounded-lg border px-3 py-2 text-sm"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                        </>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading
                            ? recoveryProcessingLabel
                            : recoveryStep === "request"
                                ? recoverySendCodeLabel
                                : recoveryStep === "verify"
                                    ? recoveryVerifyCodeLabel
                                    : recoveryChangePasswordLabel}
                    </button>
                    <button
                        type="button"
                        onClick={resetRecovery}
                        className="w-full text-sm text-blue-600 hover:text-blue-700"
                    >
                        {recoveryBackToLoginLabel}
                    </button>
                </form>
            ) : (
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
                {!registerMode && (
                    <button
                        type="button"
                        onClick={() => {
                            setRecoveryMode(true);
                            setRecoveryStep("request");
                            setError(null);
                            setSuccess(null);
                        }}
                        className="w-full text-sm text-blue-600 hover:text-blue-700"
                    >
                        {forgotPasswordLabel}
                    </button>
                )}
            </form>
            )}
        </div>
    );
};

export default LoginPage;
