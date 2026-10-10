import { useEffect, useState } from "react";
import { isAdminRole } from "../../auth/roles";
import { useAuth } from "../../hooks/useAuth";
import { labels } from "../../i18n/uiLabels";
import { SessionExpiredError } from "../../services/authService";
import { useUiLabels } from "../../hooks/useUiLabels";

type EmailQuota = {
    day: string;
    limit: number;
    warningThreshold: number;
    count: number | null;
    remaining: number | null;
    status: "ok" | "warning" | "exhausted" | "unavailable";
};

function isQuota(value: unknown): value is EmailQuota {
    if (!value || typeof value !== "object") return false;
    const quota = value as Partial<EmailQuota>;
    if (typeof quota.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(quota.day) ||
        !Number.isInteger(quota.limit) || quota.limit! <= 0 ||
        !Number.isInteger(quota.warningThreshold) || quota.warningThreshold! < 0 ||
        quota.warningThreshold! > quota.limit!) return false;
    if (quota.status === "unavailable") return quota.count === null && quota.remaining === null;
    if (!Number.isInteger(quota.count) || quota.count! < 0 ||
        !Number.isInteger(quota.remaining) || quota.remaining! < 0 ||
        quota.remaining !== Math.max(0, quota.limit! - quota.count!)) return false;
    const status = quota.count! >= quota.limit! ? "exhausted" :
        quota.count! >= quota.warningThreshold! ? "warning" : "ok";
    return quota.status === status;
}

export function EmailQuotaNotice() {
    const { isAuthenticated, user, authFetch } = useAuth();
    const { t } = useUiLabels();
    const quotaLabels = Object.fromEntries(Object.entries(labels.emailQuota).map(([key, source]) => [key, t(source)])) as Record<keyof typeof labels.emailQuota, string>;
    const allowed = isAuthenticated && isAdminRole(user?.role);
    const [quota, setQuota] = useState<EmailQuota | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!allowed) return;
        let active = true;
        let pending = false;
        let expired = false;
        const controller = new AbortController();
        setQuota(null);
        setLoading(true);
        async function refresh() {
            if (pending || expired) return;
            pending = true;
            try {
                const response = await authFetch("/api/db-status/email-quota", { signal: controller.signal });
                if (!response.ok) throw new Error("Quota unavailable");
                const payload: unknown = await response.json();
                const data = payload && typeof payload === "object" && "data" in payload ? payload.data : null;
                if (!isQuota(data)) throw new Error("Invalid quota response");
                if (active) setQuota(data);
            } catch (error) {
                // authFetch retains its usual refresh/session-expiry behavior.
                if (error instanceof SessionExpiredError) expired = true;
                if (active) setQuota(null);
            } finally {
                pending = false;
                if (active) setLoading(false);
            }
        }
        void refresh();
        const timer = window.setInterval(() => { void refresh(); }, 60_000);
        return () => {
            active = false;
            controller.abort();
            window.clearInterval(timer);
        };
    }, [allowed, user?.id, authFetch]);

    if (!allowed) return null;
    const unavailable = !loading && (!quota || quota.status === "unavailable");
    const alert = unavailable || quota?.status === "warning" || quota?.status === "exhausted";
    const message = loading ? quotaLabels.loading : unavailable ? quotaLabels.unavailable :
        quota?.status === "exhausted" ? quotaLabels.exhausted :
        quota?.status === "warning" ? quotaLabels.warning : quotaLabels.normal;
    const color = unavailable || quota?.status === "exhausted" ? "border-red-200 bg-red-50 text-red-800" :
        quota?.status === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" :
        "border-slate-200 bg-slate-50 text-slate-700";
    return (
        <div role={alert ? "alert" : "status"} aria-atomic="true"
            className={`border-t px-3 py-2 text-xs lg:fixed lg:bottom-0 lg:left-0 lg:z-10 lg:w-64 lg:border-r ${color}`}>
            <div className="font-semibold">{quotaLabels.title}</div>
            {!loading && !unavailable && quota && (
                <>
                    <div>{quotaLabels.day.replace("{day}", quota.day)}</div>
                    <div>{quotaLabels.counter.replace("{count}", String(quota.count)).replace("{limit}", String(quota.limit))}</div>
                    <div>{quotaLabels.remaining.replace("{remaining}", String(quota.remaining))}</div>
                </>
            )}
            <div>{message}</div>
        </div>
    );
}
