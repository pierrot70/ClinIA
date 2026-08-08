const COLLECTION = "specialists";

export const migration = {
    id: "20260808-add-specialist-practice-locations",
    description:
        "Backfills the primary clinic and its availability as a specialist practice location.",
    reversible: false,
    transactional: false,
    fingerprint: "specialist-practice-locations-v1",
    async up({ db }) {
        await db.collection(COLLECTION).updateMany(
            {
                clinique_associer: { $exists: true, $ne: null },
                "practiceLocations.0": { $exists: false },
            },
            [
                {
                    $set: {
                        practiceLocations: [
                            {
                                clinique: "$clinique_associer",
                                disponibilites: { $ifNull: ["$disponibilites", []] },
                            },
                        ],
                    },
                },
            ]
        );
    },
};
