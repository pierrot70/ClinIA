const COLLECTION = "refreshtokensessions";

export const migration = {
    id: "20260726-add-refresh-token-family-indexes",
    description:
        "Creates indexes for hashed refresh token families and replay detection.",
    reversible: true,
    fingerprint: "refresh-token-family-indexes-v1",
    async up({ db, session }) {
        const collection = db.collection(COLLECTION);
        await collection.createIndex({ tokenHash: 1 }, {
            name: "token_hash_unique",
            unique: true,
            session,
        });
        await collection.createIndex({ familyId: 1, status: 1 }, {
            name: "family_status",
            session,
        });
        await collection.createIndex({ userId: 1, status: 1 }, {
            name: "user_status",
            session,
        });
        await collection.createIndex({ expiresAt: 1 }, {
            name: "expires_at_ttl",
            expireAfterSeconds: 0,
            session,
        });
    },
    async down({ db, session }) {
        const collection = db.collection(COLLECTION);
        await Promise.all([
            collection.dropIndex("token_hash_unique", { session }),
            collection.dropIndex("family_status", { session }),
            collection.dropIndex("user_status", { session }),
            collection.dropIndex("expires_at_ttl", { session }),
        ]);
    },
};
