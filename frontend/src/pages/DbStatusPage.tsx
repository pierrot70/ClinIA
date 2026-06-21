import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock, Database, HardDrive, RefreshCw, Server } from "lucide-react";
import { fetchDbStatus, type DbStatusPayload } from "../services/dbStatusApi";
import type { ApiError } from "../types/api";

const REFRESH_INTERVAL_MS = 5_000;

function formatBytes(value?: number | null) {
    if (value == null || !Number.isFinite(value)) {
        return "-";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatNumber(value?: number | null) {
    if (value == null || !Number.isFinite(value)) {
        return "-";
    }

    return new Intl.NumberFormat("fr-CA").format(value);
}

function formatTimestamp(value?: string | null) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("fr-CA");
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span
            className={
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium " +
                (ok
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-red-50 text-red-700 ring-1 ring-red-200")
            }
        >
            {label}
        </span>
    );
}

function MetricCard({
    icon,
    label,
    value,
    detail,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    detail?: string;
}) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {label}
                    </div>
                    <div className="truncate text-lg font-semibold text-gray-950">
                        {value}
                    </div>
                </div>
            </div>
            {detail && <div className="mt-3 text-sm text-gray-500">{detail}</div>}
        </div>
    );
}

function getOverallStatus(data: DbStatusPayload | null) {
    if (!data) {
        return { ok: false, label: "Aucune donnee" };
    }

    if (data.connection.status !== "connected" || !data.ping.ok) {
        return { ok: false, label: "BD degradee" };
    }

    if (data.database?.status === "error") {
        return { ok: false, label: "Stats BD indisponibles" };
    }

    return { ok: true, label: "BD operationnelle" };
}

export function DbStatusPage() {
    const [data, setData] = useState<DbStatusPayload | null>(null);
    const [error, setError] = useState<ApiError | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastRefreshStartedAt, setLastRefreshStartedAt] = useState<Date | null>(null);

    const loadStatus = useCallback(async (showLoading = false) => {
        if (showLoading) {
            setLoading(true);
        }

        setLastRefreshStartedAt(new Date());
        const response = await fetchDbStatus();

        if ("error" in response) {
            setError(response.error);
            setData(null);
        } else {
            setError(null);
            setData(response.data);
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        void loadStatus(true);
        const intervalId = window.setInterval(() => {
            void loadStatus(false);
        }, REFRESH_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [loadStatus]);

    const overall = useMemo(() => getOverallStatus(data), [data]);
    const database = data?.database?.status === "ok" ? data.database : null;
    const collectionErrors = data?.collections.filter((collection) => collection.status !== "ok") || [];

    return (
        <section className="mx-auto max-w-6xl px-4 py-8">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <StatusPill ok={overall.ok} label={overall.label} />
                        {data?.replicaSet.available && (
                            <StatusPill ok={true} label={`Replica set ${data.replicaSet.setName || "detecte"}`} />
                        )}
                    </div>
                    <h1 className="text-2xl font-semibold text-gray-950">Etat des bases de donnees</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600">
                        Vue admin rafraichie toutes les 5 secondes pour surveiller Mongo, le replica set et les collections applicatives.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => void loadStatus(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={loading}
                >
                    <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
                    Rafraichir
                </button>
            </div>

            {error && (
                <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error.message}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    icon={<Database className="h-5 w-5" />}
                    label="Connexion"
                    value={data?.connection.status || (loading ? "Chargement" : "Indisponible")}
                    detail={data?.connection.databaseName ? `${data.connection.databaseName} sur ${data.connection.host || "host inconnu"}` : undefined}
                />
                <MetricCard
                    icon={<Activity className="h-5 w-5" />}
                    label="Ping Mongo"
                    value={data?.ping.ok ? "OK" : "Non disponible"}
                    detail={data?.ping.latencyMs != null ? `${data.ping.latencyMs} ms` : data?.ping.error || undefined}
                />
                <MetricCard
                    icon={<Server className="h-5 w-5" />}
                    label="Replica set"
                    value={data?.replicaSet.available ? data.replicaSet.setName || "Detecte" : "Non detecte"}
                    detail={data?.replicaSet.available ? `${data.replicaSet.hosts.length} membre(s), primaire: ${data.replicaSet.primary || "inconnu"}` : data?.replicaSet.error || undefined}
                />
                <MetricCard
                    icon={<Clock className="h-5 w-5" />}
                    label="Derniere lecture"
                    value={data ? formatTimestamp(data.checkedAt) : "-"}
                    detail={lastRefreshStartedAt ? `Demande lancee: ${lastRefreshStartedAt.toLocaleTimeString("fr-CA")}` : undefined}
                />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
                <MetricCard icon={<HardDrive className="h-5 w-5" />} label="Donnees" value={formatBytes(database?.dataSizeBytes)} detail={`${formatNumber(database?.objects)} document(s)`} />
                <MetricCard icon={<HardDrive className="h-5 w-5" />} label="Stockage" value={formatBytes(database?.storageSizeBytes)} detail={`${formatNumber(database?.collections)} collection(s)`} />
                <MetricCard icon={<HardDrive className="h-5 w-5" />} label="Index" value={formatBytes(database?.indexSizeBytes)} detail={`${formatNumber(database?.indexes)} index`} />
                <MetricCard icon={<Activity className="h-5 w-5" />} label="Temps backend" value={data ? `${data.responseTimeMs} ms` : "-"} detail={collectionErrors.length > 0 ? `${collectionErrors.length} collection(s) en erreur` : "Collections lisibles"} />
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                    <h2 className="text-base font-semibold text-gray-950">Collections Mongo</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="px-4 py-3">Collection</th>
                                <th className="px-4 py-3">Etat</th>
                                <th className="px-4 py-3 text-right">Documents</th>
                                <th className="px-4 py-3 text-right">Donnees</th>
                                <th className="px-4 py-3 text-right">Stockage</th>
                                <th className="px-4 py-3 text-right">Index</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {(data?.collections || []).map((collection) => (
                                <tr key={collection.name}>
                                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{collection.name}</td>
                                    <td className="px-4 py-3">
                                        <StatusPill ok={collection.status === "ok"} label={collection.status === "ok" ? "OK" : "Erreur"} />
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-700">{formatNumber(collection.documentCount)}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{formatBytes(collection.sizeBytes)}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{formatBytes(collection.storageSizeBytes)}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{formatNumber(collection.indexCount)} / {formatBytes(collection.indexSizeBytes)}</td>
                                </tr>
                            ))}
                            {!loading && !data?.collections.length && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        Aucune collection a afficher.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
