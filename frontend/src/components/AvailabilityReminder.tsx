import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useUiLabelTree } from "../hooks/useUiLabels";
import { labels } from "../i18n/uiLabels";

const LOW_AVAILABILITY_THRESHOLD = 20;

export function AvailabilityReminder() {
    const { authFetch } = useAuth();
    const { pathname } = useLocation();
    const copy = useUiLabelTree(labels.availabilityReminder);
    const [availableCount, setAvailableCount] = useState<number | null>(null);
    const onLoginPage = /\/login\/?$/i.test(pathname);

    useEffect(() => {
        const controller = new AbortController();
        async function loadAvailability() {
            try {
                const response = await authFetch("/api/appointments/my-availability-summary", {
                    signal: controller.signal,
                    retryOnUnauthorized: false,
                });
                if (!response.ok) return;

                const { data } = await response.json();
                const count = data?.availableCount;
                if (!controller.signal.aborted && Number.isInteger(count) && count >= 0 && count < LOW_AVAILABILITY_THRESHOLD) {
                    setAvailableCount(count);
                }
            } catch {
                // Availability is optional and never blocks a clinician's session.
            }
        }

        void loadAvailability();
        return () => controller.abort();
    }, [authFetch]);

    if (onLoginPage || availableCount === null) return null;

    return (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
                <div role="status">
                    <p className="font-semibold">{copy.title}</p>
                    <p>{copy.body.replace("{count}", String(availableCount))}</p>
                </div>
                <button
                    type="button"
                    className="rounded border border-amber-700 px-3 py-1 hover:bg-amber-100"
                    onClick={() => setAvailableCount(null)}
                >
                    {copy.dismiss}
                </button>
            </div>
        </div>
    );
}
