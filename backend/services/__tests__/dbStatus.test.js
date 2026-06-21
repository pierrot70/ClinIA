import { describe, expect, it } from "vitest";

import { getDbStatus } from "../dbStatus.js";

function createConnectedConnection() {
    const collections = [
        { name: "patients" },
        { name: "diagnosisresults" },
    ];

    const db = {
        databaseName: "clinia",
        admin: () => ({
            ping: async () => ({ ok: 1 }),
            command: async (command) => {
                if (command.replSetGetStatus) {
                    return {
                        set: "rs0",
                        members: [
                            { name: "mongo:27017", stateStr: "PRIMARY", health: 1, optimeDate: new Date("2026-01-01T00:00:05Z") },
                            { name: "mongo-replica-1:27017", stateStr: "SECONDARY", health: 1, optimeDate: new Date("2026-01-01T00:00:05Z") },
                            { name: "mongo-replica-2:27017", stateStr: "SECONDARY", health: 1, optimeDate: new Date("2026-01-01T00:00:04Z") },
                        ],
                    };
                }

                return {
                    setName: "rs0",
                    isWritablePrimary: true,
                    secondary: false,
                    primary: "mongo:27017",
                    hosts: ["mongo:27017", "mongo-replica-1:27017", "mongo-replica-2:27017"],
                };
            },
        }),
        stats: async () => ({
            collections: 2,
            objects: 12,
            dataSize: 2048,
            storageSize: 4096,
            indexes: 4,
            indexSize: 1024,
        }),
        listCollections: () => ({
            toArray: async () => collections,
        }),
        collection: (name) => ({
            estimatedDocumentCount: async () => (name === "patients" ? 2 : 10),
        }),
        command: async ({ collStats }) => ({
            size: collStats === "patients" ? 512 : 1536,
            storageSize: collStats === "patients" ? 1024 : 3072,
            nindexes: 2,
            totalIndexSize: 256,
        }),
    };

    return {
        readyState: 1,
        name: "clinia",
        host: "mongo",
        port: 27017,
        db,
    };
}

describe("dbStatus service", () => {
    it("builds a database status snapshot when Mongo is connected", async () => {
        const status = await getDbStatus({ connection: createConnectedConnection() });

        expect(status.connection).toMatchObject({
            status: "connected",
            databaseName: "clinia",
            host: "mongo",
            port: 27017,
        });
        expect(status.ping.ok).toBe(true);
        expect(status.replicaSet).toMatchObject({
            available: true,
            setName: "rs0",
            isWritablePrimary: true,
            primary: "mongo:27017",
        });
        expect(status.replicaSet.members).toEqual([
            expect.objectContaining({ name: "mongo:27017", role: "primary", onlineStatus: "online", syncStatus: "synced" }),
            expect.objectContaining({ name: "mongo-replica-1:27017", role: "secondary", onlineStatus: "online", syncStatus: "synced" }),
            expect.objectContaining({ name: "mongo-replica-2:27017", role: "secondary", onlineStatus: "online", syncStatus: "synced", lagSeconds: 1 }),
        ]);
        expect(status.database).toMatchObject({
            status: "ok",
            collections: 2,
            objects: 12,
        });
        expect(status.collections).toEqual([
            expect.objectContaining({ name: "diagnosisresults", status: "ok", documentCount: 10 }),
            expect.objectContaining({ name: "patients", status: "ok", documentCount: 2 }),
        ]);
    });

    it("returns an unavailable snapshot when Mongo is disconnected", async () => {
        const status = await getDbStatus({
            connection: {
                readyState: 0,
                name: "clinia",
                host: "mongo",
                port: 27017,
            },
        });

        expect(status.connection.status).toBe("disconnected");
        expect(status.ping.ok).toBe(false);
        expect(status.replicaSet.available).toBe(false);
        expect(status.replicaSet.members).toEqual([]);
        expect(status.database).toBeNull();
        expect(status.collections).toEqual([]);
    });
});
