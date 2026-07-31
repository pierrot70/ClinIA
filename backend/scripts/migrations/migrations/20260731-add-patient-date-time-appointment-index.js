const COLLECTION = "appointments";
const INDEX_NAME = "patient_date_time_scheduled_unique";

export const migration = {
    id: "20260731-add-patient-date-time-appointment-index",
    description:
        "Prevents concurrent appointments for the same patient at the same time.",
    reversible: true,
    transactional: false,
    fingerprint: "patient-date-time-appointment-index-v1",
    async up({ db, session }) {
        await db.collection(COLLECTION).createIndex(
            { patient: 1, date: 1, time: 1 },
            {
                name: INDEX_NAME,
                unique: true,
                partialFilterExpression: { status: "scheduled" },
                session,
            }
        );
    },
    async down({ db, session }) {
        await db.collection(COLLECTION).dropIndex(INDEX_NAME, { session });
    },
};
