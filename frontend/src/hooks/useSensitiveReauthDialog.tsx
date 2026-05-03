import React, { useCallback, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { labels } from "../i18n/uiLabels";

type PendingResolver = ((value: boolean) => void) | null;

export function useSensitiveReauthDialog() {
    const { reauthenticate, user } = useAuth();
    const resolverRef = useRef<PendingResolver>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const closeWithResult = useCallback((result: boolean) => {
        resolverRef.current?.(result);
        resolverRef.current = null;
        setIsOpen(false);
        setPassword("");
        setError("");
        setSubmitting(false);
    }, []);

    const requestSensitiveReauth = useCallback(() => {
        setPassword("");
        setError("");
        setSubmitting(false);
        setIsOpen(true);

        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
        });
    }, []);

    const onSubmit = useCallback(async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            await reauthenticate(password);
            closeWithResult(true);
        } catch (err) {
            setSubmitting(false);
            setError(
                err instanceof Error
                    ? err.message
                    : labels.auth.sensitiveAction.networkError
            );
        }
    }, [closeWithResult, password, reauthenticate]);

    const modal = isOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <h2 className="text-lg font-semibold text-gray-900">
                    {labels.auth.sensitiveAction.title}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                    {labels.auth.sensitiveAction.description}
                </p>
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <div className="font-medium">
                        {labels.auth.sensitiveAction.connectedAccountPrefix} {user?.email || user?.id || "SUPERADMIN"}
                    </div>
                    <div className="mt-1">
                        {labels.auth.sensitiveAction.helper}
                    </div>
                </div>

                <form onSubmit={onSubmit} className="mt-5 space-y-4">
                    <label className="block text-sm text-gray-700">
                        {labels.auth.sensitiveAction.passwordLabel}
                        <input
                            type="password"
                            name="current-password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                            autoFocus
                            required
                        />
                    </label>

                    {error ? (
                        <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    ) : null}

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {submitting
                                ? labels.auth.sensitiveAction.confirming
                                : labels.auth.sensitiveAction.confirm}
                        </button>
                        <button
                            type="button"
                            onClick={() => closeWithResult(false)}
                            disabled={submitting}
                            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            {labels.auth.sensitiveAction.cancel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    ) : null;

    return {
        requestSensitiveReauth,
        sensitiveReauthModal: modal,
    };
}
