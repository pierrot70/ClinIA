import { getSafeRequestPath } from "../../../utils/requestLogSafety.js";

const AUDIT_COLLECTIONS = [
    "writeoperationauditlogs",
    "patientauditlogs",
    "openairequestauditlogs",
    "securityincidents",
];
const BULK_SIZE = 250;

async function flushUpdates(collection, updates, session) {
    if (updates.length === 0) return;
    const batch = updates.splice(0, updates.length);
    await collection.bulkWrite(batch, { ordered: false, session });
}

export const migration = {
    id: "20260718-sanitize-audit-request-paths",
    description:
        "Removes query values and opaque identifiers from stored audit request paths.",
    reversible: false,
    fingerprint: "audit-request-path-sanitization-v1",

    async up({ db, session }) {
        for (const collectionName of AUDIT_COLLECTIONS) {
            const collection = db.collection(collectionName);
            const cursor = collection.find(
                { requestPath: { $type: "string" } },
                { session, projection: { requestPath: 1 } }
            );
            const updates = [];

            for await (const document of cursor) {
                const requestPath = getSafeRequestPath(document.requestPath);
                if (!requestPath || requestPath === document.requestPath) continue;

                updates.push({
                    updateOne: {
                        filter: { _id: document._id },
                        update: { $set: { requestPath } },
                    },
                });

                if (updates.length >= BULK_SIZE) {
                    await flushUpdates(collection, updates, session);
                }
            }

            await flushUpdates(collection, updates, session);
        }
    },
};
