import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Archive, Clock, Database, HardDrive, RefreshCw, Server } from "lucide-react";
import { fetchDbStatus, updateBackupProtection, type DbStatusPayload } from "../services/dbStatusApi";
import type { ApiError } from "../types/api";
import { labels } from "../i18n/uiLabels";

const REFRESH_INTERVAL_MS = 5_000;
const MAX_REPLICA_READINGS = 8;

type ReplicaReading = {
    id: string;
    checkedAt: string;
    status: DbStatusPayload["replicaSet"]["summary"]["status"];
    healthyCount: number;
    memberCount: number;
    primaryCount: number;
    secondaryCount: number;
    majorityAvailable: boolean;
    maxLagSeconds: number | null;
    laggingThresholdSeconds: number;
};

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

function formatAgeHours(value?: number | null) {
    if (value == null || !Number.isFinite(value)) {
        return "-";
    }

    return `${value.toLocaleString("fr-CA")} ${labels.dbStatus.backups.hoursSuffix}`;
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

function TonePill({
    tone,
    label,
}: {
    tone: "emerald" | "amber" | "red" | "slate";
    label: string;
}) {
    const toneClass = {
        emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
        red: "bg-red-50 text-red-700 ring-1 ring-red-200",
        slate: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
    }[tone];

    return (
        <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium " + toneClass}>
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

function memberToneClass(status: "online" | "down" | "unknown" | "synced" | "syncing" | "unsynced" | "not-applicable") {
    if (status === "online" || status === "synced") {
        return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    }

    if (status === "not-applicable") {
        return "bg-slate-50 text-slate-700 ring-1 ring-slate-200";
    }

    if (status === "syncing" || status === "unknown") {
        return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    }

    return "bg-red-50 text-red-700 ring-1 ring-red-200";
}

function isStandaloneMember(member: DbStatusPayload["replicaSet"]["members"][number]) {
    return member.state.toLowerCase() === "standalone";
}

function ReplicaMemberCard({ member }: { member: DbStatusPayload["replicaSet"]["members"][number] }) {
    const replicaLabels = labels.dbStatus.replica;
    const standalone = isStandaloneMember(member);
    const roleLabel = standalone ? "standalone" : member.role;
    const onlineLabel = standalone ? "online" : member.onlineStatus;
    const syncLabel = standalone ? "sync n/a" : member.syncStatus;
    const syncTone = standalone ? "not-applicable" : member.syncStatus;

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-950">{member.name}</div>
                    <div className="mt-1 text-xs uppercase text-gray-500">{roleLabel}</div>
                </div>
                <span className={"inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium " + memberToneClass(standalone ? "online" : member.onlineStatus)}>
                    {onlineLabel}
                </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium " + memberToneClass(syncTone)}>
                    {syncLabel}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                    {member.state}
                </span>
                {member.lagSeconds != null && (
                    <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                        lag {member.lagSeconds}{replicaLabels.secondsSuffix}
                    </span>
                )}
            </div>
            <div className="mt-4 space-y-1 text-xs text-gray-500">
                {member.syncSourceHost && (
                    <div>
                        <span className="font-medium text-gray-700">{replicaLabels.syncSource}: </span>
                        <span>{member.syncSourceHost}</span>
                    </div>
                )}
                {member.optimeDate && (
                    <div>
                        <span className="font-medium text-gray-700">{replicaLabels.optime}: </span>
                        <span>{formatTimestamp(member.optimeDate)}</span>
                    </div>
                )}
                {member.lastHeartbeatMessage && (
                    <div>
                        <span className="font-medium text-gray-700">{replicaLabels.heartbeat}: </span>
                        <span>{member.lastHeartbeatMessage}</span>
                    </div>
                )}
            </div>
            {member.error && <div className="mt-3 text-xs text-red-700">{member.error}</div>}
        </div>
    );
}

function getReplicaTone(status?: DbStatusPayload["replicaSet"]["summary"]["status"]) {
    if (status === "OK") {
        return "emerald" as const;
    }

    if (status === "DEGRADED" || status === "LAGGING") {
        return "amber" as const;
    }

    if (status === "INCIDENT") {
        return "red" as const;
    }

    return "slate" as const;
}

function getReplicaStatusLabel(status?: DbStatusPayload["replicaSet"]["summary"]["status"]) {
    const replicaLabels = labels.dbStatus.replica;
    return status ? replicaLabels.statuses[status] : replicaLabels.statuses.UNKNOWN;
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

function getBackupStatusLabel(status?: DbStatusPayload["backups"]["latestStatus"]) {
    const backupLabels = labels.dbStatus.backups;

    if (status === "ok") {
        return backupLabels.latestOk;
    }

    if (status === "warning") {
        return backupLabels.latestWarning;
    }

    if (status === "missing") {
        return backupLabels.latestMissing;
    }

    return backupLabels.unavailable;
}

function getChecksumLabel(backup: DbStatusPayload["backups"]["backups"][number]) {
    const backupLabels = labels.dbStatus.backups;

    if (backup.sha256Error) {
        return backupLabels.shaError;
    }

    if (backup.sha256Verified === true) {
        return backupLabels.shaVerified;
    }

    return backup.sha256FilePresent ? backupLabels.shaPresent : backupLabels.shaError;
}

function toReplicaReading(payload: DbStatusPayload): ReplicaReading | null {
    if (!payload.replicaSet.available) {
        return null;
    }

    const { summary } = payload.replicaSet;

    return {
        id: [
            summary.status,
            summary.healthyCount,
            summary.memberCount,
            summary.primaryCount,
            summary.secondaryCount,
            summary.majorityAvailable ? "majority" : "no-majority",
            summary.status === "LAGGING" ? "lagging" : "lag-ok",
        ].join(":"),
        checkedAt: payload.checkedAt,
        status: summary.status,
        healthyCount: summary.healthyCount,
        memberCount: summary.memberCount,
        primaryCount: summary.primaryCount,
        secondaryCount: summary.secondaryCount,
        majorityAvailable: summary.majorityAvailable,
        maxLagSeconds: summary.maxLagSeconds,
        laggingThresholdSeconds: summary.laggingThresholdSeconds,
    };
}

function getProtectionLabel(backup: DbStatusPayload["backups"]["backups"][number]) {
    return backup.protected
        ? labels.dbStatus.backups.protected
        : labels.dbStatus.backups.protectAction;
}

export function DbStatusPage() {
    const [data, setData] = useState<DbStatusPayload | null>(null);
    const [error, setError] = useState<ApiError | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [protectingFileName, setProtectingFileName] = useState<string | null>(null);
    const [lastRefreshStartedAt, setLastRefreshStartedAt] = useState<Date | null>(null);
    const [replicaReadings, setReplicaReadings] = useState<ReplicaReading[]>([]);
    const refreshInFlightRef = useRef(false);
    const clearedReplicaReadingIdRef = useRef<string | null>(null);
    const consecutiveLagReadingsRef = useRef(0);

    const loadStatus = useCallback(async (showLoading = false) => {
        if (refreshInFlightRef.current) {
            return;
        }

        refreshInFlightRef.current = true;
        setRefreshing(true);
        if (showLoading) {
            setLoading(true);
        }

        try {
            setLastRefreshStartedAt(new Date());
            const response = await fetchDbStatus();

            if ("error" in response) {
                setError(response.error);
                setData(null);
            } else {
                setError(null);
                setData(response.data);
                const reading = toReplicaReading(response.data);

                if (reading) {
                    if (reading.status === "LAGGING") {
                        consecutiveLagReadingsRef.current += 1;
                    } else {
                        consecutiveLagReadingsRef.current = 0;
                    }

                    setReplicaReadings((currentReadings) => {
                        if (reading.status === "LAGGING" && consecutiveLagReadingsRef.current < 2) {
                            return currentReadings;
                        }

                        if (currentReadings.length === 0 && clearedReplicaReadingIdRef.current === reading.id) {
                            return currentReadings;
                        }

                        if (clearedReplicaReadingIdRef.current && clearedReplicaReadingIdRef.current !== reading.id) {
                            clearedReplicaReadingIdRef.current = null;
                        }

                        if (currentReadings[0]?.id === reading.id) {
                            return currentReadings;
                        }

                        return [reading, ...currentReadings].slice(0, MAX_REPLICA_READINGS);
                    });
                }
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
            refreshInFlightRef.current = false;
        }
    }, []);

    const handleToggleBackupProtection = useCallback(async (backup: DbStatusPayload["backups"]["backups"][number]) => {
        setProtectingFileName(backup.fileName);
        const response = await updateBackupProtection(backup.fileName, !backup.protected);

        if ("error" in response) {
            setError(response.error);
        } else {
            await loadStatus(false);
        }

        setProtectingFileName(null);
    }, [loadStatus]);

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
    const replicaMembers = data?.replicaSet.members || [];
    const backupLabels = labels.dbStatus.backups;
    const replicaLabels = labels.dbStatus.replica;
    const backupStatusOk = data?.backups.latestStatus === "ok";
    const standaloneMode = replicaMembers.length === 1 && isStandaloneMember(replicaMembers[0]);
    const syncedMembers = replicaMembers.filter((member) => member.syncStatus === "synced").length;
    const replicaSummary = standaloneMode
        ? "Mode standalone local"
        : `${syncedMembers} / ${replicaMembers.length} membre(s) synchronise(s)`;

    return (
        <section className="mx-auto max-w-6xl px-4 py-8">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <StatusPill ok={overall.ok} label={overall.label} />
                        {data?.replicaSet.available && (
                            <TonePill
                                tone={getReplicaTone(data.replicaSet.summary.status)}
                                label={`${replicaLabels.setName} ${getReplicaStatusLabel(data.replicaSet.summary.status)}`}
                            />
                        )}
                    </div>
                    <h1 className="text-2xl font-semibold text-gray-950">Etat des bases de donnees</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600">
                        {labels.dbStatus.replica.autoRefreshDescription}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => void loadStatus(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={loading}
                >
                    <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
                    {labels.dbStatus.replica.refreshAction}
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
                    label={replicaLabels.setName}
                    value={data?.replicaSet.available ? getReplicaStatusLabel(data.replicaSet.summary.status) : replicaLabels.notDetected}
                    detail={data?.replicaSet.available
                        ? `${data.replicaSet.setName || replicaLabels.detected}, ${replicaLabels.primary}: ${data.replicaSet.primary || replicaLabels.unknownPrimary}`
                        : data?.replicaSet.error || undefined}
                />
                <MetricCard
                    icon={<Clock className="h-5 w-5" />}
                    label={replicaLabels.lastReading}
                    value={data ? formatTimestamp(data.checkedAt) : "-"}
                    detail={lastRefreshStartedAt
                        ? `${refreshing ? replicaLabels.refreshing : replicaLabels.lastRequest}: ${lastRefreshStartedAt.toLocaleTimeString("fr-CA")}`
                        : undefined}
                />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
                <MetricCard icon={<HardDrive className="h-5 w-5" />} label="Donnees" value={formatBytes(database?.dataSizeBytes)} detail={`${formatNumber(database?.objects)} document(s)`} />
                <MetricCard icon={<HardDrive className="h-5 w-5" />} label="Stockage" value={formatBytes(database?.storageSizeBytes)} detail={`${formatNumber(database?.collections)} collection(s)`} />
                <MetricCard icon={<HardDrive className="h-5 w-5" />} label="Index" value={formatBytes(database?.indexSizeBytes)} detail={`${formatNumber(database?.indexes)} index`} />
                <MetricCard icon={<Activity className="h-5 w-5" />} label="Temps backend" value={data ? `${data.responseTimeMs} ms` : "-"} detail={collectionErrors.length > 0 ? `${collectionErrors.length} collection(s) en erreur` : "Collections lisibles"} />
            </div>

            {data?.replicaSet.available && (
                <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <Server className="h-5 w-5 text-slate-600" />
                                <h2 className="text-base font-semibold text-gray-950">{replicaLabels.title}</h2>
                            </div>
                            <p className="mt-1 text-sm text-gray-500">{replicaLabels.subtitle}</p>
                        </div>
                        <TonePill
                            tone={getReplicaTone(data.replicaSet.summary.status)}
                            label={getReplicaStatusLabel(data.replicaSet.summary.status)}
                        />
                    </div>
                    <div className="grid gap-3 px-4 py-4 text-sm md:grid-cols-5">
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{replicaLabels.health}</div>
                            <div className="mt-1 font-semibold text-gray-950">
                                {data.replicaSet.summary.healthyCount} / {data.replicaSet.summary.memberCount}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{replicaLabels.majority}</div>
                            <div className="mt-1 font-semibold text-gray-950">
                                {data.replicaSet.summary.majorityAvailable
                                    ? replicaLabels.majorityAvailable
                                    : replicaLabels.majorityUnavailable}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{replicaLabels.primary}</div>
                            <div className="mt-1 font-semibold text-gray-950">{data.replicaSet.summary.primaryCount}</div>
                        </div>
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{replicaLabels.secondaries}</div>
                            <div className="mt-1 font-semibold text-gray-950">{data.replicaSet.summary.secondaryCount}</div>
                        </div>
                        <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{replicaLabels.maxLag}</div>
                            <div className="mt-1 font-semibold text-gray-950">
                                {data.replicaSet.summary.maxLagSeconds == null
                                    ? replicaLabels.noLag
                                    : `${data.replicaSet.summary.maxLagSeconds}${replicaLabels.secondsSuffix}`}
                                <span className="ml-1 text-xs font-normal text-gray-500">
                                    / {data.replicaSet.summary.laggingThresholdSeconds}{replicaLabels.secondsSuffix}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
                        {data.replicaSet.summary.message}
                    </div>
                    <div className="border-t border-gray-100 bg-slate-50 px-4 py-3">
                        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm font-semibold text-gray-950">{replicaLabels.lastReadings}</div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="text-xs text-gray-500">
                                    {replicaLabels.refreshEvery} {REFRESH_INTERVAL_MS / 1000}{replicaLabels.secondsSuffix}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearedReplicaReadingIdRef.current = data ? toReplicaReading(data)?.id ?? null : null;
                                        setReplicaReadings([]);
                                    }}
                                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    {replicaLabels.clearTransitions}
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {replicaReadings.map((reading, index) => (
                                <div
                                    key={reading.id}
                                    className="min-w-[13rem] rounded-md border border-gray-200 bg-white p-3 text-xs shadow-sm"
                                >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <TonePill
                                            tone={getReplicaTone(reading.status)}
                                            label={getReplicaStatusLabel(reading.status)}
                                        />
                                        {index === 0 && (
                                            <span className="text-[11px] font-medium uppercase text-gray-400">
                                                {replicaLabels.current}
                                            </span>
                                        )}
                                    </div>
                                    <div className="font-medium text-gray-950">{formatTimestamp(reading.checkedAt)}</div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-gray-600">
                                        <span>{replicaLabels.health}: {reading.healthyCount}/{reading.memberCount}</span>
                                        <span>{replicaLabels.primary}: {reading.primaryCount}</span>
                                        <span>{replicaLabels.secondaries}: {reading.secondaryCount}</span>
                                        <span>
                                            {replicaLabels.maxLag}: {reading.maxLagSeconds ?? replicaLabels.noLag}{reading.maxLagSeconds == null ? "" : replicaLabels.secondsSuffix}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-gray-500">
                                        {replicaLabels.majority}: {reading.majorityAvailable
                                            ? replicaLabels.majorityAvailable
                                            : replicaLabels.majorityUnavailable}
                                    </div>
                                </div>
                            ))}
                            {replicaReadings.length === 0 && (
                                <div className="text-sm text-gray-500">{replicaLabels.noReadings}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Archive className="h-5 w-5 text-slate-600" />
                            <h2 className="text-base font-semibold text-gray-950">{backupLabels.title}</h2>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{backupLabels.description}</p>
                    </div>
                    <StatusPill
                        ok={backupStatusOk}
                        label={getBackupStatusLabel(data?.backups.latestStatus)}
                    />
                </div>
                <div className="grid gap-3 border-b border-gray-100 px-4 py-3 text-sm text-gray-600 md:grid-cols-4">
                    <div>
                        <span className="font-medium text-gray-900">{backupLabels.directory}: </span>
                        <span className="break-all">{data?.backups.directory || "-"}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-900">{backupLabels.retention}: </span>
                        {data?.backups.retentionDays ?? "-"} {backupLabels.daysSuffix}
                    </div>
                    <div>
                        <span className="font-medium text-gray-900">{backupLabels.age}: </span>
                        {formatAgeHours(data?.backups.latestAgeHours)}
                    </div>
                    <div>
                        <span className="font-medium text-gray-900">{backupLabels.checksum}: </span>
                        {data?.backups.checksumMode === "verified"
                            ? backupLabels.checksumModeVerified
                            : backupLabels.checksumModeRecorded}
                    </div>
                </div>
                {data?.backups.error && (
                    <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {data.backups.error}
                    </div>
                )}
                <div className="border-b border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    <p>{backupLabels.sizeNote}</p>
                    <p className="mt-1">{backupLabels.keepNote}</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="px-4 py-3">{backupLabels.file}</th>
                                <th className="px-4 py-3 text-right">{backupLabels.size}</th>
                                <th className="px-4 py-3 text-right">{backupLabels.collections}</th>
                                <th className="px-4 py-3 text-right">{backupLabels.documents}</th>
                                <th className="px-4 py-3 text-right">{backupLabels.age}</th>
                                <th className="px-4 py-3">{backupLabels.checksum}</th>
                                <th className="px-4 py-3">{backupLabels.protection}</th>
                                <th className="px-4 py-3">{backupLabels.createdAt}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {(data?.backups.backups || []).map((backup) => (
                                <tr key={backup.fileName}>
                                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{backup.fileName}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{formatBytes(backup.sizeBytes)}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">
                                        {backup.manifest.available ? formatNumber(backup.manifest.collectionCount) : backupLabels.unavailableShort}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-700">
                                        {backup.manifest.available ? formatNumber(backup.manifest.documentCount) : backupLabels.unavailableShort}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-700">{formatAgeHours(backup.ageHours)}</td>
                                    <td className="px-4 py-3">
                                        <StatusPill ok={!backup.sha256Error && backup.sha256FilePresent} label={getChecksumLabel(backup)} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {backup.protected && (
                                                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                                                    {backupLabels.protected}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => void handleToggleBackupProtection(backup)}
                                                disabled={protectingFileName === backup.fileName}
                                                className={
                                                    "inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium ring-1 disabled:cursor-not-allowed disabled:opacity-60 " +
                                                    (backup.protected
                                                        ? "bg-white text-amber-800 ring-amber-200 hover:bg-amber-50"
                                                        : "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100")
                                                }
                                            >
                                                {protectingFileName === backup.fileName
                                                    ? backupLabels.protecting
                                                    : backup.protected
                                                        ? backupLabels.unprotectAction
                                                        : getProtectionLabel(backup)}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatTimestamp(backup.createdAt)}</td>
                                </tr>
                            ))}
                            {!loading && !data?.backups.backups.length && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                        {backupLabels.empty}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {replicaMembers.length > 0 && (
                <div className="mt-6">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">Membres Mongo</h2>
                            <p className="text-sm text-gray-500">
                                {replicaSummary}
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        {replicaMembers.map((member) => (
                            <ReplicaMemberCard key={member.name} member={member} />
                        ))}
                    </div>
                </div>
            )}

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
