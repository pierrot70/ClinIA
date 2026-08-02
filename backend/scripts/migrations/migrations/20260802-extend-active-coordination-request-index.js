const COLLECTION = "appointmentcoordinationrequests";
const INDEX_NAME = "patient_specialty_open_unique";

const ACTIVE_REQUEST_FILTER = {
    status: { $in: ["open", "ready_to_schedule"] },
};

export const migration = {
    id: "20260802-extend-active-coordination-request-index",
    description:
        "Keeps one active coordination request while it is ready to be scheduled.",
    reversible: true,
    transactional: false,
    fingerprint: "appointment-coordination-request-active-index-v2",
    async up({ db, session }) {
        await db.collection(COLLECTION).dropIndex(INDEX_NAME, { session });
        await db.collection(COLLECTION).createIndex(
            { patient: 1, specialty: 1 },
            {
                name: INDEX_NAME,
                unique: true,
                partialFilterExpression: ACTIVE_REQUEST_FILTER,
                session,
            }
        );
    },
    async down({ db, session }) {
        await db.collection(COLLECTION).dropIndex(INDEX_NAME, { session });
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
};
