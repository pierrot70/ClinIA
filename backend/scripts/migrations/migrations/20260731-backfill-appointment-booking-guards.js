const APPOINTMENTS_COLLECTION = "appointments";
const GUARDS_COLLECTION = "appointmentbookingguards";
const GUARD_INDEX_NAME = "patient_specialist_day_unique";
const BATCH_SIZE = 500;

export const migration = {
    id: "20260731-backfill-appointment-booking-guards",
    description:
        "Backfills atomic daily appointment capacity guards for scheduled appointments.",
    reversible: true,
    transactional: false,
    fingerprint: "appointment-booking-guards-v1",
    async up({ db, session }) {
        const guards = db.collection(GUARDS_COLLECTION);

        await guards.createIndex(
            { patient: 1, specialist: 1, date: 1 },
            { name: GUARD_INDEX_NAME, unique: true, session }
        );
        await guards.deleteMany({}, { session });

        const cursor = db.collection(APPOINTMENTS_COLLECTION).aggregate(
            [
                { $match: { status: "scheduled" } },
                {
                    $group: {
                        _id: {
                            patient: "$patient",
                            specialist: "$specialist",
                            date: "$date",
                        },
                        scheduledCount: { $sum: 1 },
                    },
                },
            ],
            { allowDiskUse: true, session }
        );

        let operations = [];
        for await (const entry of cursor) {
            operations.push({
                insertOne: {
                    document: {
                        patient: entry._id.patient,
                        specialist: entry._id.specialist,
                        date: entry._id.date,
                        scheduledCount: entry.scheduledCount,
                    },
                },
            });

            if (operations.length === BATCH_SIZE) {
                await guards.bulkWrite(operations, { ordered: true, session });
                operations = [];
            }
        }

        if (operations.length > 0) {
            await guards.bulkWrite(operations, { ordered: true, session });
        }
    },
    async down({ db, session }) {
        await db.collection(GUARDS_COLLECTION).drop({ session });
    },
};
