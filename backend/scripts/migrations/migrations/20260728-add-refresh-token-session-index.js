const COLLECTION = "refreshtokensessions";

export const migration = {
    id: "20260728-add-refresh-token-session-index",
    description:
        "Creates an index for bounded concurrent refresh token sessions.",
    reversible: true,
    transactional: false,
    fingerprint: "refresh-token-session-index-v2",
    async up({ db, session }) {
        await db.collection(COLLECTION).createIndex(
            { userId: 1, sessionId: 1, status: 1 },
            { name: "user_session_status", session }
        );
    },
    async down({ db, session }) {
        await db.collection(COLLECTION).dropIndex("user_session_status", {
            session,
        });
    },
};
