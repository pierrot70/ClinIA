const COLLECTION = "appointmentcoordinationrequests";
const INDEX_NAME = "patient_specialty_open_unique";

export const migration = {
    id: "20260802-add-appointment-coordination-request-index",
    description:
        "Prevents duplicate open coordination requests for the same patient and specialty.",
    reversible: true,
    transactional: false,
    fingerprint: "appointment-coordination-request-open-index-v1",
    async up({ db, session }) {
        await db.collection(COLLECTION).createIndex(
            { patient: 1, specialty: 1 },
            {
                name: INDEX_NAME,
                unique: true,
                partialFilterExpression: { status: "open" },
                session,
            }
        );
    },
    async down({ db, session }) {
        await db.collection(COLLECTION).dropIndex(INDEX_NAME, { session });
    },
};
