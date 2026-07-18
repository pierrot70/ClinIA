import crypto from "node:crypto";
import mongoose from "mongoose";
import { migrations } from "./migrations/index.js";

const WRITE_CONCERN = { w: "majority", j: true, wtimeout: 5000 };
const REGISTRY_COLLECTION = "schemamigrations";
const LOCK_COLLECTION = "schemamigrationlocks";
const LOCK_ID = "mongo-migrations";

function fail(message) {
    throw new Error(message);
}

function parseArguments(argv) {
    const options = {
        apply: false,
        migrationId: null,
        allowIrreversible: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === "--dry-run") continue;
        if (value === "--apply") {
            options.apply = true;
            continue;
        }
        if (value === "--allow-irreversible") {
            options.allowIrreversible = true;
            continue;
        }
        if (value === "--migration") {
            options.migrationId = argv[index + 1] || null;
            index += 1;
            continue;
        }
        fail(`unknown_argument value=${value}`);
    }

    return options;
}

function migrationChecksum(migration) {
    return crypto
        .createHash("sha256")
        .update(`${migration.id}:${migration.fingerprint}`)
        .digest("hex");
}

function selectedMigrations(options) {
    const ordered = [...migrations].sort((left, right) =>
        left.id.localeCompare(right.id)
    );
    const uniqueIds = new Set(ordered.map((migration) => migration.id));
    if (uniqueIds.size !== ordered.length) {
        fail("duplicate_migration_id");
    }

    if (!options.migrationId) return ordered;

    const selected = ordered.filter(
        (migration) => migration.id === options.migrationId
    );
    if (selected.length !== 1) {
        fail(`migration_not_found id=${options.migrationId}`);
    }
    return selected;
}

async function acquireLock(db) {
    const owner = crypto.randomUUID();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    try {
        const result = await db.collection(LOCK_COLLECTION).findOneAndUpdate(
            {
                _id: LOCK_ID,
                $or: [
                    { leaseExpiresAt: { $lte: now } },
                    { owner },
                ],
            },
            {
                $set: {
                    owner,
                    acquiredAt: now,
                    leaseExpiresAt,
                },
            },
            { upsert: true, returnDocument: "after" }
        );
        const lock = result?.value ?? result;
        if (lock?.owner !== owner) {
            fail("migration_lock_unavailable");
        }
    } catch (error) {
        if (error?.code === 11000) {
            fail("migration_lock_unavailable");
        }
        throw error;
    }

    return owner;
}

async function releaseLock(db, owner) {
    await db.collection(LOCK_COLLECTION).deleteOne({ _id: LOCK_ID, owner });
}

async function run() {
    const options = parseArguments(process.argv.slice(2));
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) fail("missing_MONGO_URI");

    const selected = selectedMigrations(options);
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const registry = db.collection(REGISTRY_COLLECTION);
    await registry.createIndex({ id: 1 }, { unique: true });

    const pending = [];
    for (const migration of selected) {
        const checksum = migrationChecksum(migration);
        const applied = await registry.findOne({ id: migration.id });
        if (applied && applied.checksum !== checksum) {
            fail(`migration_checksum_mismatch id=${migration.id}`);
        }
        if (applied) {
            console.log(`SKIP id=${migration.id} reason=already_applied`);
        } else {
            pending.push({ migration, checksum });
            console.log(
                `PENDING id=${migration.id} reversible=${migration.reversible} description=${migration.description}`
            );
        }
    }

    if (!options.apply) {
        console.log(`DRY_RUN_COMPLETE pending=${pending.length}`);
        return;
    }

    const irreversible = pending.find(({ migration }) => !migration.reversible);
    if (irreversible && !options.allowIrreversible) {
        fail(`irreversible_migration_requires_allow_flag id=${irreversible.migration.id}`);
    }

    const lockOwner = await acquireLock(db);
    try {
        for (const { migration, checksum } of pending) {
            const startedAt = Date.now();
            const registryEntry = {
                id: migration.id,
                checksum,
                description: migration.description,
                reversible: migration.reversible,
                appliedAt: new Date(),
                durationMs: 0,
                runner: "clinia-mongo-migrations-v1",
            };

            if (migration.transactional === false) {
                await migration.up({ db, session: null });
                registryEntry.durationMs = Date.now() - startedAt;
                await registry.insertOne(registryEntry);
                console.log(`APPLIED id=${migration.id}`);
                continue;
            }

            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    await migration.up({ db, session });
                    registryEntry.durationMs = Date.now() - startedAt;
                    await registry.insertOne(registryEntry, { session });
                }, { writeConcern: WRITE_CONCERN });
            } finally {
                await session.endSession();
            }
            console.log(`APPLIED id=${migration.id}`);
        }
    } finally {
        await releaseLock(db, lockOwner);
    }

    console.log(`APPLY_COMPLETE applied=${pending.length}`);
}

run()
    .catch((error) => {
        console.error(`ERROR ${error?.message || "migration_failed"}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
