import mongoose from "mongoose";

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

function buildUnavailablePayload({ connection, checkedAt, startedAt }) {
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

    if (readyState !== 1 || !connection?.db) {
        return buildUnavailablePayload({ connection, checkedAt, startedAt });
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

    const [dbStats, replicaSet, collections] = await Promise.all([
        db.stats().catch((err) => ({ error: err?.message || "Database stats unavailable." })),
        readReplicaSetSnapshot(db, connection),
        readCollectionSnapshots(db).catch(() => []),
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
    };
}
