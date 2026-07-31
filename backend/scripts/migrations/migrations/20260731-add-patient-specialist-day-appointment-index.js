const COLLECTION = "appointments";
const INDEX_NAME = "patient_specialist_date_scheduled_time_idx";

export const migration = {
    id: "20260731-add-patient-specialist-day-appointment-index",
    description:
        "Creates an index for patient-specific daily appointment scheduling.",
    reversible: true,
    transactional: false,
    fingerprint: "patient-specialist-day-appointment-index-v1",
    async up({ db, session }) {
        await db.collection(COLLECTION).createIndex(
            { patient: 1, specialist: 1, date: 1, status: 1, time: 1 },
            {
                name: INDEX_NAME,
                partialFilterExpression: { status: "scheduled" },
                session,
            }
        );
    },
    async down({ db, session }) {
        await db.collection(COLLECTION).dropIndex(INDEX_NAME, { session });
    },
};
