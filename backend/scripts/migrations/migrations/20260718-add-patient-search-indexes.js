import {
    buildPatientSearchKeys,
    normalizeHealthInsuranceJurisdiction,
    normalizePatientCountry,
} from "../../../utils/patientSearchKeys.js";

const COLLECTION = "patients";
const INDEXES = [
    { key: { ownerUserId: 1, nomSearch: 1 }, name: "owner_nom_search_idx" },
    { key: { ownerUserId: 1, prenomSearch: 1 }, name: "owner_prenom_search_idx" },
    { key: { ownerUserId: 1, addresseSearch: 1 }, name: "owner_addresse_search_idx" },
    { key: { ownerUserId: 1, telephoneSearch: 1 }, name: "owner_telephone_search_idx" },
    {
        key: { ownerUserId: 1, healthInsuranceNumberSearch: 1 },
        name: "owner_health_insurance_number_search_idx",
    },
    {
        key: { country: 1, healthInsuranceJurisdiction: 1, healthInsuranceNumberSearch: 1 },
        name: "health_insurance_number_unique_idx",
        options: {
            unique: true,
            partialFilterExpression: {
                healthInsuranceNumberSearch: { $type: "string" },
            },
        },
    },
];
const BULK_SIZE = 250;

async function flush(collection, operations) {
    if (operations.length === 0) return;
    await collection.bulkWrite(operations.splice(0, operations.length), {
        ordered: false,
    });
}

export const migration = {
    id: "20260718-add-patient-search-indexes",
    description:
        "Backfills normalized patient search keys and replaces the RAMQ-only unique index with country and jurisdiction-aware insurance uniqueness.",
    reversible: false,
    transactional: false,
    fingerprint: "patient-search-indexes-v3-country-health-insurance",

    async up({ db }) {
        const collection = db.collection(COLLECTION);
        const cursor = collection.find({}, {
            projection: {
                nom: 1,
                prenom: 1,
                addresse: 1,
                telephone: 1,
                num_assurance_maladie: 1,
                country: 1,
                healthInsuranceJurisdiction: 1,
                nomSearch: 1,
                prenomSearch: 1,
                addresseSearch: 1,
                telephoneSearch: 1,
                healthInsuranceNumberSearch: 1,
            },
        });
        const operations = [];

        for await (const patient of cursor) {
            const keys = buildPatientSearchKeys(patient);
            const healthInsuranceJurisdiction =
                normalizeHealthInsuranceJurisdiction(
                    patient.healthInsuranceJurisdiction,
                    patient.num_assurance_maladie
                );
            const updates = {
                ...keys,
                country: normalizePatientCountry(patient.country),
                healthInsuranceJurisdiction,
            };
            if (Object.entries(updates).every(([key, value]) => patient[key] === value)) {
                continue;
            }

            operations.push({
                updateOne: {
                    filter: { _id: patient._id },
                    update: { $set: updates },
                },
            });
            if (operations.length >= BULK_SIZE) {
                await flush(collection, operations);
            }
        }

        await flush(collection, operations);
        const existingIndexes = await collection.indexes();
        const legacyIndex = existingIndexes.find(
            (index) =>
                index.name === "num_assurance_maladie_1" &&
                index.unique === true
        );
        if (legacyIndex) {
            await collection.dropIndex(legacyIndex.name);
        }

        const obsoleteInsuranceIndex = existingIndexes.find(
            (index) =>
                index.name === "health_insurance_number_unique_idx" &&
                !Object.hasOwn(index.key || {}, "country")
        );
        if (obsoleteInsuranceIndex) {
            await collection.dropIndex(obsoleteInsuranceIndex.name);
        }

        for (const index of INDEXES) {
            await collection.createIndex(index.key, {
                name: index.name,
                ...index.options,
            });
        }

    },
};
