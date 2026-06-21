import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { createHash } from "crypto";

import { getDbStatus, readBackupSnapshots } from "../dbStatus.js";

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
        expect(status.backups).toMatchObject({
            directory: expect.any(String),
            retentionDays: expect.any(Number),
            backups: expect.any(Array),
        });
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
        expect(status.backups).toMatchObject({
            directory: expect.any(String),
            backups: expect.any(Array),
        });
    });

    it("lists backup archive metadata without exposing backup contents", async () => {
        const backupDirectory = await mkdtemp(path.join(os.tmpdir(), "clinia-backups-"));
        const archiveName = "clinia-prod-20260621-120000.archive.gz";
        const archivePath = path.join(backupDirectory, archiveName);
        const archiveContent = "fake gzip bytes for metadata test";
        const sha256 = createHash("sha256").update(archiveContent).digest("hex");

        try {
            await writeFile(archivePath, archiveContent);
            await writeFile(`${archivePath}.sha256`, `${sha256}  ${archiveName}\n`);

            const snapshots = await readBackupSnapshots({
                backupDirectory,
                retentionDays: 7,
            });

            expect(snapshots).toMatchObject({
                available: true,
                directory: backupDirectory,
                retentionDays: 7,
                latestStatus: "ok",
                checksumMode: "recorded",
                backups: [
                    expect.objectContaining({
                        fileName: archiveName,
                        sizeBytes: archiveContent.length,
                        createdAt: "2026-06-21T12:00:00.000Z",
                        sha256FilePresent: true,
                        sha256Verified: null,
                        sha256Error: null,
                    }),
                ],
            });
        } finally {
            await rm(backupDirectory, { recursive: true, force: true });
        }
    });
});
