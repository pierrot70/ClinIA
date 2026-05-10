import React from "react";
import { useAuth } from "../hooks/useAuth";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { useContext } from "react";
import { labels } from "../i18n/uiLabels";
import { useTranslation } from "../hooks/useTranslation";

const PasswordResetRequiredPage: React.FC = () => {
    const { logout, user } = useAuth();
    const pageLabels = labels.auth.passwordResetRequired;
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const options = { targetLang, namespace: "auth-password-reset-required" };
    const { translated: title } = useTranslation({ text: pageLabels.title, ...options });
    const { translated: detected } = useTranslation({ text: pageLabels.detected, ...options });
    const { translated: required } = useTranslation({ text: pageLabels.required, ...options });
    const { translated: contact } = useTranslation({ text: pageLabels.contact, ...options });
    const { translated: accountPrefix } = useTranslation({ text: pageLabels.accountPrefix, ...options });
    const { translated: logoutLabel } = useTranslation({ text: pageLabels.logout, ...options });

    return (
        <div className="mx-auto max-w-2xl px-4 py-12">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <h1 className="text-2xl font-semibold text-amber-950">
                    {title}
                </h1>
                <p className="mt-3 text-sm text-amber-950">
                    {detected}
                </p>
                <p className="mt-3 text-sm text-amber-950">
                    {required}
                </p>
                <p className="mt-3 text-sm text-amber-950">
                    {contact}
                </p>
                {user?.email && (
                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-amber-800">
                        {accountPrefix} {user.email}
                    </p>
                )}
                <div className="mt-6">
                    <button
                        type="button"
                        onClick={() => {
                            void logout();
                        }}
                        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                    >
                        {logoutLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasswordResetRequiredPage;
