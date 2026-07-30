const COLLECTION = "loginfailurethrottles";

export const migration = {
    id: "20260730-add-login-failure-throttle-indexes",
    description:
        "Creates indexes for account and trusted-IP login failure throttling.",
    reversible: true,
    transactional: false,
    fingerprint: "login-failure-throttle-indexes-v1",
    async up({ db, session }) {
        await db.collection(COLLECTION).createIndex(
            { userId: 1, ipHash: 1 },
            { name: "user_ip_hash_unique", unique: true, session }
        );
        await db.collection(COLLECTION).createIndex(
            { expiresAt: 1 },
            { name: "expires_at_ttl", expireAfterSeconds: 0, session }
        );

    },
    async down({ db, session }) {
        await db.collection(COLLECTION).dropIndex("user_ip_hash_unique", { session });
        await db.collection(COLLECTION).dropIndex("expires_at_ttl", { session });
    },
};
