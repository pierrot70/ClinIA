import React, { useContext, useState } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { useAuth } from "../hooks/useAuth";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";
import { API_URL } from "../services/config";

const ChangePasswordRequiredPage: React.FC = () => {
    const { authFetch, logout, user } = useAuth();
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const pageLabels = labels.auth.changePasswordRequired;
    const options = { targetLang, namespace: "auth-change-password-required" };
    const { translated: title } = useTranslation({ text: pageLabels.title, ...options });
    const { translated: description } = useTranslation({ text: pageLabels.description, ...options });
    const { translated: helper } = useTranslation({ text: pageLabels.helper, ...options });
    const { translated: newPasswordLabel } = useTranslation({ text: pageLabels.newPasswordLabel, ...options });
    const { translated: confirmPasswordLabel } = useTranslation({ text: pageLabels.confirmPasswordLabel, ...options });
    const { translated: submit } = useTranslation({ text: pageLabels.submit, ...options });
    const { translated: submitting } = useTranslation({ text: pageLabels.submitting, ...options });
    const { translated: mismatch } = useTranslation({ text: pageLabels.mismatch, ...options });
    const { translated: success } = useTranslation({ text: pageLabels.success, ...options });
    const { translated: logoutLabel } = useTranslation({ text: pageLabels.logout, ...options });

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setDone(null);

        if (newPassword !== confirmPassword) {
            setError(mismatch);
            return;
        }

        setSaving(true);
        try {
            const response = await authFetch("/api/auth/complete-password-reset", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ newPassword }),
            });

            const payload = await response.json().catch(() => ({} as any));
            if (!response.ok) {
                setError(
                    payload?.error?.message ||
                        "Impossible de finaliser le changement de mot de passe."
                );
                return;
            }

            setDone(success);
            setNewPassword("");
            setConfirmPassword("");
            window.setTimeout(() => {
                window.location.replace("/login");
            }, 1200);
        } catch {
            setError("Impossible de finaliser le changement de mot de passe.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto max-w-xl px-4 py-12">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-6 shadow-sm">
                <h1 className="text-2xl font-semibold text-sky-950">{title}</h1>
                <p className="mt-3 text-sm text-sky-950">{description}</p>
                <p className="mt-3 text-sm text-sky-900">{helper}</p>
                {user?.email && (
                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-sky-800">
                        {user.email}
                    </p>
                )}
                {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                {done && <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{done}</div>}
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="forced-new-password">
                            {newPasswordLabel}
                        </label>
                        <input
                            id="forced-new-password"
                            type="password"
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            autoComplete="new-password"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="forced-confirm-password">
                            {confirmPasswordLabel}
                        </label>
                        <input
                            id="forced-confirm-password"
                            type="password"
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                        {saving ? submitting : submit}
                    </button>
                </form>
                <button
                    type="button"
                    onClick={() => {
                        void logout();
                    }}
                    className="mt-4 text-sm text-sky-800 underline"
                >
                    {logoutLabel}
                </button>
            </div>
        </div>
    );
};

export default ChangePasswordRequiredPage;
