import mongoose from "mongoose";
import { createHash } from "crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";

const READY_STATE_LABELS = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
};

function getReadyStateLabel(readyState) {
    return READY_STATE_LABELS[readyState] || "unknown";
}

function safeNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getBackupKeepDirectory(backupDirectory) {
    return process.env.MONGO_BACKUP_KEEP_DIR || (
        backupDirectory === "/var/backups/clinia/mongo"
            ? "/var/backups/clinia/mongo-keep"
            : path.join(backupDirectory, ".keep")
    );
}

function validateBackupFileName(fileName) {
    if (
        typeof fileName !== "string" ||
        path.basename(fileName) !== fileName ||
        !/^clinia-prod-\d{8}-\d{6}\.archive\.gz$/.test(fileName)
    ) {
        throw new Error("Invalid backup filename.");
    }

    return fileName;
}

function parseBackupTimestamp(fileName) {
    const match = fileName.match(/-(\d{8})-(\d{6})\.archive\.gz$/);

    if (!match) {
        return null;
    }

    const [, datePart, timePart] = match;
    const iso = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}Z`;
    const parsed = new Date(iso);

    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function calculateSha256(filePath) {
    const content = await readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
}

async function readSha256File(filePath) {
    const content = await readFile(filePath, "utf8");
    return content.trim().split(/\s+/)[0] || null;
}

async function readBackupManifest(filePath) {
    try {
        const content = await readFile(filePath, "utf8");
        const manifest = JSON.parse(content);

        return {
            available: true,
            databaseName: typeof manifest.databaseName === "string" ? manifest.databaseName : null,
            generatedAt: typeof manifest.generatedAt === "string" ? manifest.generatedAt : null,
            collectionCount: Number.isFinite(Number(manifest.collectionCount)) ? Number(manifest.collectionCount) : null,
            documentCount: Number.isFinite(Number(manifest.documentCount)) ? Number(manifest.documentCount) : null,
        };
    } catch (err) {
        return {
            available: false,
            databaseName: null,
            generatedAt: null,
            collectionCount: null,
            documentCount: null,
            error: err?.code === "ENOENT"
                ? "manifest_missing"
                : err?.message || "manifest_unavailable",
        };
    }
}

async function readKeepMarker(keepDirectory, fileName) {
    try {
        const content = await readFile(path.join(keepDirectory, `${fileName}.keep`), "utf8");
        const marker = JSON.parse(content);

        return {
            protected: true,
            protectedAt: typeof marker.protectedAt === "string" ? marker.protectedAt : null,
        };
    } catch (err) {
        return {
            protected: false,
            protectedAt: null,
            error: err?.code === "ENOENT" ? null : err?.message || "keep_marker_unavailable",
        };
    }
}

async function buildBackupEntry({ backupDirectory, keepDirectory, fileName, nowMs }) {
    const archivePath = path.join(backupDirectory, fileName);
    const sha256Path = `${archivePath}.sha256`;
    const manifestPath = `${archivePath}.manifest.json`;
    const archiveStats = await stat(archivePath);
    const verifyChecksums = process.env.MONGO_BACKUP_VERIFY_CHECKSUMS === "true";
    const manifest = await readBackupManifest(manifestPath);
    const keep = await readKeepMarker(keepDirectory, fileName);
    let sha256FilePresent = false;
    let sha256Verified = null;
    let sha256Error = null;

    try {
        const expectedSha256 = await readSha256File(sha256Path);
        sha256FilePresent = Boolean(expectedSha256);

        if (expectedSha256 && verifyChecksums) {
            const actualSha256 = await calculateSha256(archivePath);
            sha256Verified = actualSha256 === expectedSha256;
            sha256Error = sha256Verified ? null : "sha256_mismatch";
        }
    } catch (err) {
        sha256Error = err?.code === "ENOENT"
            ? "sha256_file_missing"
            : err?.message || "sha256_unavailable";
    }

    return {
        fileName,
        sizeBytes: safeNumber(archiveStats.size),
        createdAt: parseBackupTimestamp(fileName) || archiveStats.mtime.toISOString(),
        modifiedAt: archiveStats.mtime.toISOString(),
        ageHours: Math.max(0, Math.round(((nowMs - archiveStats.mtime.getTime()) / 3_600_000) * 10) / 10),
        sha256FilePresent,
        sha256Verified,
        sha256Error,
        manifest,
        protected: keep.protected,
        protectedAt: keep.protectedAt,
        keepError: keep.error || null,
    };
}

export async function readBackupSnapshots({
    backupDirectory = process.env.MONGO_BACKUP_DIR || "/var/backups/clinia/mongo",
    keepDirectory = getBackupKeepDirectory(backupDirectory),
    retentionDays = parsePositiveInt(process.env.MONGO_BACKUP_RETENTION_DAYS || "7", 7),
    maxBackups = 8,
} = {}) {
    const nowMs = Date.now();

    try {
        const entries = await readdir(backupDirectory);
        const allBackupFileNames = entries
            .filter((entry) => entry.endsWith(".archive.gz"))
            .sort()
            .reverse();

        const allBackups = await Promise.all(
            allBackupFileNames.map((fileName) => buildBackupEntry({
                backupDirectory,
                keepDirectory,
                fileName,
                nowMs,
            }).catch((err) => ({
                fileName,
                sizeBytes: null,
                createdAt: null,
                modifiedAt: null,
                ageHours: null,
                sha256FilePresent: false,
                sha256Verified: null,
                sha256Error: err?.message || "backup_metadata_unavailable",
                manifest: {
                    available: false,
                    databaseName: null,
                    generatedAt: null,
                    collectionCount: null,
                    documentCount: null,
                    error: "backup_metadata_unavailable",
                },
                protected: false,
                protectedAt: null,
                keepError: null,
            })))
        );
        const backups = allBackups.filter((backup, index) => index < maxBackups || backup.protected);

        const latest = backups[0] || null;
        const latestAgeHours = latest?.ageHours ?? null;

        return {
            available: true,
            directory: backupDirectory,
            keepDirectory,
            retentionDays,
            maxBackups,
            expectedFrequencyHours: 24,
            checksumMode: process.env.MONGO_BACKUP_VERIFY_CHECKSUMS === "true"
                ? "verified"
                : "recorded",
            latestAgeHours,
            latestStatus: latest
                ? latest.sha256Error || latest.sha256Verified === false
                    ? "warning"
                    : "ok"
                : "missing",
            backups,
            error: null,
        };
    } catch (err) {
        return {
            available: false,
            directory: backupDirectory,
            keepDirectory,
            retentionDays,
            maxBackups,
            expectedFrequencyHours: 24,
            checksumMode: process.env.MONGO_BACKUP_VERIFY_CHECKSUMS === "true"
                ? "verified"
                : "recorded",
            latestAgeHours: null,
            latestStatus: "unavailable",
            backups: [],
            error: err?.code === "ENOENT"
                ? "Backup directory is not mounted or does not exist."
                : err?.message || "Backup metadata unavailable.",
        };
    }
}

export async function setBackupProtection({
    fileName,
    protectedValue,
    backupDirectory = process.env.MONGO_BACKUP_DIR || "/var/backups/clinia/mongo",
    keepDirectory = getBackupKeepDirectory(backupDirectory),
} = {}) {
    const safeFileName = validateBackupFileName(fileName);
    const archivePath = path.join(backupDirectory, safeFileName);
    const markerPath = path.join(keepDirectory, `${safeFileName}.keep`);

    await stat(archivePath);
    await mkdir(keepDirectory, { recursive: true });

    if (protectedValue) {
        const payload = {
            fileName: safeFileName,
            protectedAt: new Date().toISOString(),
            reason: "manual_dashboard_keep",
        };
        await writeFile(markerPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
        return { fileName: safeFileName, protected: true, protectedAt: payload.protectedAt };
    }

    await unlink(markerPath).catch((err) => {
        if (err?.code !== "ENOENT") {
            throw err;
        }
    });

    return { fileName: safeFileName, protected: false, protectedAt: null };
}

function memberRoleFromState(stateStr, serverType) {
    const normalizedState = String(stateStr || "").toUpperCase();
    const normalizedType = String(serverType || "").toLowerCase();

    if (normalizedState === "PRIMARY" || normalizedType.includes("primary")) {
        return "primary";
    }

    if (normalizedState === "SECONDARY" || normalizedType.includes("secondary")) {
        return "secondary";
    }

    if (normalizedState === "ARBITER" || normalizedType.includes("arbiter")) {
        return "arbiter";
    }

    return "unknown";
}

function memberOnlineStatus({ health, stateStr, serverType, error }) {
    const normalizedState = String(stateStr || "").toUpperCase();
    const normalizedType = String(serverType || "").toLowerCase();

    if (health === 0 || normalizedState === "DOWN" || normalizedType === "unknown" || error) {
        return "down";
    }

    if (health === 1 || normalizedState === "PRIMARY" || normalizedState === "SECONDARY" || normalizedType.includes("primary") || normalizedType.includes("secondary")) {
        return "online";
    }

    return "unknown";
}

function memberSyncStatus({ stateStr, serverType, onlineStatus }) {
    const normalizedState = String(stateStr || "").toUpperCase();
    const normalizedType = String(serverType || "").toLowerCase();

    if (onlineStatus === "down") {
        return "unsynced";
    }

    if (normalizedState === "PRIMARY" || normalizedState === "SECONDARY" || normalizedType.includes("primary") || normalizedType.includes("secondary")) {
        return "synced";
    }

    if (["STARTUP2", "RECOVERING", "ROLLBACK"].includes(normalizedState)) {
        return "syncing";
    }

    return "unknown";
}

function normalizeReplicaMember({ name, stateStr = null, health = null, serverType = null, error = null, lagSeconds = null, source = "unknown" }) {
    const onlineStatus = memberOnlineStatus({ health, stateStr, serverType, error });

    return {
        name,
        role: memberRoleFromState(stateStr, serverType),
        state: stateStr || serverType || "unknown",
        onlineStatus,
        syncStatus: memberSyncStatus({ stateStr, serverType, onlineStatus }),
        health: health == null ? null : safeNumber(health),
        lagSeconds,
        error,
        source,
    };
}

function readTopologyMembers(connection) {
    const servers = connection?.client?.topology?.description?.servers;

    if (!servers || typeof servers.values !== "function") {
        return [];
    }

    return Array.from(servers.values()).map((server) => normalizeReplicaMember({
        name: server.address || [server.host, server.port].filter(Boolean).join(":"),
        serverType: server.type,
        error: server.error?.message || null,
        source: "driver",
    })).filter((member) => member.name);
}

function readStatusMembers(status) {
    const primaryOptimeDate = status?.members?.find((member) => member.stateStr === "PRIMARY")?.optimeDate;

    return Array.isArray(status?.members)
        ? status.members.map((member) => {
            let lagSeconds = null;

            if (primaryOptimeDate && member.optimeDate) {
                lagSeconds = Math.max(0, Math.round((new Date(primaryOptimeDate).getTime() - new Date(member.optimeDate).getTime()) / 1000));
            }

            return normalizeReplicaMember({
                name: member.name,
                stateStr: member.stateStr,
                health: member.health,
                error: member.healthMessage || null,
                lagSeconds,
                source: "replicaStatus",
            });
        })
        : [];
}

function mergeReplicaMembers({ helloHosts, statusMembers, topologyMembers }) {
    const byName = new Map();

    for (const host of helloHosts) {
        byName.set(host, normalizeReplicaMember({ name: host, source: "hello" }));
    }

    for (const member of topologyMembers) {
        byName.set(member.name, { ...(byName.get(member.name) || {}), ...member });
    }

    for (const member of statusMembers) {
        byName.set(member.name, { ...(byName.get(member.name) || {}), ...member });
    }

    return Array.from(byName.values()).sort((a, b) => {
        const roleOrder = { primary: 0, secondary: 1, arbiter: 2, unknown: 3 };
        return (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3) || a.name.localeCompare(b.name);
    });
}

function buildUnavailablePayload({ connection, checkedAt, startedAt, backups }) {
    const readyState = connection?.readyState ?? 0;

    return {
        checkedAt,
        responseTimeMs: Date.now() - startedAt,
        connection: {
            readyState,
            status: getReadyStateLabel(readyState),
            databaseName: connection?.name || null,
            host: connection?.host || null,
            port: connection?.port || null,
        },
        ping: {
            ok: false,
            latencyMs: null,
        },
        replicaSet: {
            available: false,
            setName: null,
            isWritablePrimary: null,
            secondary: null,
            primary: null,
            hosts: [],
            members: [],
            error: "Mongo connection is not ready.",
        },
        database: null,
        collections: [],
        backups,
    };
}

async function readReplicaSetSnapshot(db, connection) {
    try {
        const hello = await db.admin().command({ hello: 1 });
        const status = await db.admin().command({ replSetGetStatus: 1 }).catch(() => null);
        const helloHosts = Array.from(new Set([
            hello.primary,
            ...(Array.isArray(hello.hosts) ? hello.hosts : []),
            ...(Array.isArray(hello.passives) ? hello.passives : []),
            ...(Array.isArray(hello.arbiters) ? hello.arbiters : []),
        ].filter(Boolean)));
        const members = mergeReplicaMembers({
            helloHosts,
            statusMembers: readStatusMembers(status),
            topologyMembers: readTopologyMembers(connection),
        });

        return {
            available: Boolean(hello.setName || helloHosts.length || members.length),
            setName: hello.setName || status?.set || null,
            isWritablePrimary: hello.isWritablePrimary === true,
            secondary: hello.secondary === true,
            primary: hello.primary || members.find((member) => member.role === "primary")?.name || null,
            hosts: helloHosts,
            members,
            error: null,
        };
    } catch (err) {
        return {
            available: false,
            setName: null,
            isWritablePrimary: null,
            secondary: null,
            primary: null,
            hosts: [],
            members: readTopologyMembers(connection),
            error: err?.message || "Replica set metadata unavailable.",
        };
    }
}

async function readCollectionSnapshots(db) {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();

    const snapshots = await Promise.all(
        collections.map(async (collectionInfo) => {
            const name = collectionInfo.name;

            try {
                const collection = db.collection(name);
                const count = await collection.estimatedDocumentCount();
                const stats = await db.command({ collStats: name }).catch(() => null);

                return {
                    name,
                    status: "ok",
                    documentCount: safeNumber(count),
                    sizeBytes: safeNumber(stats?.size),
                    storageSizeBytes: safeNumber(stats?.storageSize),
                    indexCount: safeNumber(stats?.nindexes),
                    indexSizeBytes: safeNumber(stats?.totalIndexSize),
                    error: null,
                };
            } catch (err) {
                return {
                    name,
                    status: "error",
                    documentCount: null,
                    sizeBytes: null,
                    storageSizeBytes: null,
                    indexCount: null,
                    indexSizeBytes: null,
                    error: err?.message || "Collection stats unavailable.",
                };
            }
        })
    );

    return snapshots.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDbStatus({ connection = mongoose.connection } = {}) {
    const startedAt = Date.now();
    const checkedAt = new Date(startedAt).toISOString();
    const readyState = connection?.readyState ?? 0;
    const backupsPromise = readBackupSnapshots();

    if (readyState !== 1 || !connection?.db) {
        return buildUnavailablePayload({
            connection,
            checkedAt,
            startedAt,
            backups: await backupsPromise,
        });
    }

    const db = connection.db;
    const pingStartedAt = Date.now();
    let pingOk = false;
    let pingError = null;

    try {
        await db.admin().ping();
        pingOk = true;
    } catch (err) {
        pingError = err?.message || "Mongo ping failed.";
    }

    const [dbStats, replicaSet, collections, backups] = await Promise.all([
        db.stats().catch((err) => ({ error: err?.message || "Database stats unavailable." })),
        readReplicaSetSnapshot(db, connection),
        readCollectionSnapshots(db).catch(() => []),
        backupsPromise,
    ]);

    return {
        checkedAt,
        responseTimeMs: Date.now() - startedAt,
        connection: {
            readyState,
            status: getReadyStateLabel(readyState),
            databaseName: connection.name || db.databaseName || null,
            host: connection.host || null,
            port: connection.port || null,
        },
        ping: {
            ok: pingOk,
            latencyMs: Date.now() - pingStartedAt,
            error: pingError,
        },
        replicaSet,
        database: dbStats?.error
            ? { status: "error", error: dbStats.error }
            : {
                status: "ok",
                collections: safeNumber(dbStats.collections),
                objects: safeNumber(dbStats.objects),
                dataSizeBytes: safeNumber(dbStats.dataSize),
                storageSizeBytes: safeNumber(dbStats.storageSize),
                indexes: safeNumber(dbStats.indexes),
                indexSizeBytes: safeNumber(dbStats.indexSize),
            },
        collections,
        backups,
    };
}
