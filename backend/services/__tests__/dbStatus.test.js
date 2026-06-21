import { describe, expect, it } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { createHash } from "crypto";

import { getDbStatus, readBackupSnapshots, setBackupProtection } from "../dbStatus.js";

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
        const manifest = {
            databaseName: "clinia",
            generatedAt: "2026-06-21T12:00:01.000Z",
            collectionCount: 2,
            documentCount: 12,
            collections: [
                { name: "appointments", documentCount: 8 },
                { name: "patients", documentCount: 4 },
            ],
        };

        try {
            await writeFile(archivePath, archiveContent);
            await writeFile(`${archivePath}.sha256`, `${sha256}  ${archiveName}\n`);
            await writeFile(`${archivePath}.manifest.json`, JSON.stringify(manifest));

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
                        protected: false,
                        manifest: expect.objectContaining({
                            available: true,
                            databaseName: "clinia",
                            collectionCount: 2,
                            documentCount: 12,
                        }),
                    }),
                ],
            });
        } finally {
            await rm(backupDirectory, { recursive: true, force: true });
        }
    });

    it("keeps older backups visible when the manifest is missing", async () => {
        const backupDirectory = await mkdtemp(path.join(os.tmpdir(), "clinia-backups-"));
        const archiveName = "clinia-prod-20260621-130000.archive.gz";
        const archivePath = path.join(backupDirectory, archiveName);
        const archiveContent = "older backup without manifest";
        const sha256 = createHash("sha256").update(archiveContent).digest("hex");

        try {
            await writeFile(archivePath, archiveContent);
            await writeFile(`${archivePath}.sha256`, `${sha256}  ${archiveName}\n`);

            const snapshots = await readBackupSnapshots({
                backupDirectory,
                retentionDays: 7,
            });

            expect(snapshots.backups[0]).toMatchObject({
                fileName: archiveName,
                manifest: {
                    available: false,
                    collectionCount: null,
                    documentCount: null,
                    error: "manifest_missing",
                },
            });
            expect(snapshots.latestStatus).toBe("ok");
        } finally {
            await rm(backupDirectory, { recursive: true, force: true });
        }
    });

    it("marks a backup as protected and keeps protected backups beyond the recent display limit", async () => {
        const backupDirectory = await mkdtemp(path.join(os.tmpdir(), "clinia-backups-"));
        const keepDirectory = await mkdtemp(path.join(os.tmpdir(), "clinia-backups-keep-"));
        const protectedArchiveName = "clinia-prod-20260621-010000.archive.gz";

        try {
            for (let index = 1; index <= 10; index += 1) {
                const hour = String(index).padStart(2, "0");
                const archiveName = `clinia-prod-20260621-${hour}0000.archive.gz`;
                const archivePath = path.join(backupDirectory, archiveName);
                const archiveContent = `backup-${index}`;
                const sha256 = createHash("sha256").update(archiveContent).digest("hex");

                await writeFile(archivePath, archiveContent);
                await writeFile(`${archivePath}.sha256`, `${sha256}  ${archiveName}\n`);
            }

            const protection = await setBackupProtection({
                fileName: protectedArchiveName,
                protectedValue: true,
                backupDirectory,
                keepDirectory,
            });

            await expect(stat(path.join(keepDirectory, `${protectedArchiveName}.keep`))).resolves.toBeTruthy();
            expect(protection).toMatchObject({
                fileName: protectedArchiveName,
                protected: true,
            });

            const snapshots = await readBackupSnapshots({
                backupDirectory,
                keepDirectory,
                retentionDays: 7,
                maxBackups: 8,
            });

            expect(snapshots.maxBackups).toBe(8);
            expect(snapshots.backups).toHaveLength(9);
            expect(snapshots.backups[0].fileName).toBe("clinia-prod-20260621-100000.archive.gz");
            expect(snapshots.backups).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        fileName: protectedArchiveName,
                        protected: true,
                        protectedAt: expect.any(String),
                    }),
                ])
            );
        } finally {
            await rm(backupDirectory, { recursive: true, force: true });
            await rm(keepDirectory, { recursive: true, force: true });
        }
    });
});
