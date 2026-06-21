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
            error: "Mongo connection is not ready.",
        },
        database: null,
        collections: [],
    };
}

async function readReplicaSetSnapshot(db) {
    try {
        const hello = await db.admin().command({ hello: 1 });

        return {
            available: true,
            setName: hello.setName || null,
            isWritablePrimary: hello.isWritablePrimary === true,
            secondary: hello.secondary === true,
            primary: hello.primary || null,
            hosts: Array.isArray(hello.hosts) ? hello.hosts : [],
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
        readReplicaSetSnapshot(db),
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
