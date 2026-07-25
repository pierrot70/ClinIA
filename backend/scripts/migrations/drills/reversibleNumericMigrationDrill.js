import crypto from "node:crypto";
import mongoose from "mongoose";

const WRITE_CONCERN = { w: "majority", j: true, wtimeout: 5000 };
const COLLECTION_NAME = "migration_drill_numeric_samples";
const SCALE = 100;
const SAMPLES = [12.345, 7.891, 18.5, 0.1];

function fail(message) {
    throw new Error(message);
}

function sameNumber(left, right) {
    return Math.abs(left - right) < Number.EPSILON;
}

async function run() {
    if (!process.env.MONGO_URI) fail("missing_MONGO_URI");

    const marker = `clinia-migration-drill-${Date.now()}-${crypto.randomUUID()}`;
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const collection = db.collection(COLLECTION_NAME);
    const session = await mongoose.startSession();

    try {
        console.log("Testing reversible numeric migration pattern");
        console.log(`Collection: ${COLLECTION_NAME}`);
        console.log(`Marker: ${marker}`);
        console.log(`Scale: ${SCALE}`);

        await session.withTransaction(async () => {
            await collection.insertMany(
                SAMPLES.map((measurementFloat, index) => ({
                    marker,
                    sample: index + 1,
                    measurementFloat,
                    createdAt: new Date(),
                })),
                { session }
            );
        }, { writeConcern: WRITE_CONCERN });
        console.log(`Seeded samples: ${SAMPLES.length}`);

        await session.withTransaction(async () => {
            const documents = await collection
                .find({ marker }, { session })
                .sort({ sample: 1 })
                .toArray();

            for (const document of documents) {
                const measurementScaledInt = Math.round(
                    document.measurementFloat * SCALE
                );
                await collection.updateOne(
                    { _id: document._id, marker },
                    {
                        $set: {
                            measurementScaledInt,
                            migration: {
                                sourceField: "measurementFloat",
                                scale: SCALE,
                                migratedAt: new Date(),
                            },
                        },
                    },
                    { session }
                );
            }
        }, { writeConcern: WRITE_CONCERN });
        console.log("Forward migration: source float preserved, integer representation added");

        const migrated = await collection
            .find({ marker })
            .sort({ sample: 1 })
            .toArray();
        if (migrated.length !== SAMPLES.length) {
            fail(`unexpected_sample_count actual=${migrated.length}`);
        }

        const missingSource = migrated.filter(
            (document) => typeof document.measurementFloat !== "number"
        );
        if (missingSource.length > 0) {
            fail(`source_float_missing count=${missingSource.length}`);
        }

        const lossy = migrated.filter((document) => {
            const roundTrip = document.measurementScaledInt / SCALE;
            return !sameNumber(document.measurementFloat, roundTrip);
        });
        console.log(`Round-trip check: lossy_samples=${lossy.length}/${migrated.length}`);

        if (lossy.length === 0) {
            fail("expected_lossy_samples_not_detected");
        }

        console.log("Safe migration rule verified: original float remains the source of truth");
        console.log("No destructive conversion or source-field deletion was performed");
    } finally {
        await collection.deleteMany({ marker });
        await session.endSession();
        await mongoose.disconnect();
        console.log(`Cleanup: marker=${marker}`);
    }

    console.log("STAGING_REVERSIBLE_NUMERIC_MIGRATION_DRILL_PASSED");
}

run().catch(() => {
    console.error("ERROR migration_drill_failed");
    process.exitCode = 1;
});
