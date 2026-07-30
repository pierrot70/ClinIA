import mongoose from "mongoose";
import { AdminUser } from "../../models/AdminUser.js";
import { AppSettings } from "../../models/AppSettings.js";
import { Appointment } from "../../models/Appointment.js";
import { AuthAuditLog } from "../../models/AuthAuditLog.js";
import { ClinicianComment } from "../../models/ClinicianComment.js";
import { Clinique } from "../../models/Clinique.js";
import { DiagnosisResult } from "../../models/DiagnosisResult.js";
import { MassDownloadWindow } from "../../models/MassDownloadWindow.js";
import { OpenAIRequestAuditLog } from "../../models/OpenAIRequestAuditLog.js";
import { Patient } from "../../models/Patient.js";
import { PatientAuditLog } from "../../models/PatientAuditLog.js";
import { PatientClinicalNoteVersion } from "../../models/PatientClinicalNoteVersion.js";
import { PatientSecureRequestSnapshot } from "../../models/PatientSecureRequestSnapshot.js";
import { RateLimitWindow } from "../../models/RateLimitWindow.js";
import { RefreshTokenSession } from "../../models/RefreshTokenSession.js";
import { SecurityIncident } from "../../models/SecurityIncident.js";
import { Specialist } from "../../models/Specialist.js";
import { UiTranslationCache } from "../../models/UiTranslationCache.js";
import { WriteOperationAuditLog } from "../../models/WriteOperationAuditLog.js";
import { auditCollectionIndexes, hasIndexAuditErrors } from "./indexAudit.js";

const MODELS = [
    AdminUser, AppSettings, Appointment, AuthAuditLog, ClinicianComment,
    Clinique, DiagnosisResult, MassDownloadWindow, OpenAIRequestAuditLog,
    Patient, PatientAuditLog, PatientClinicalNoteVersion,
    PatientSecureRequestSnapshot, RateLimitWindow, RefreshTokenSession,
    SecurityIncident, Specialist, UiTranslationCache, WriteOperationAuditLog,
];

function serializeIndex(index) {
    return JSON.stringify(index);
}

async function collectionExists(db, collectionName) {
    return Boolean(
        await db
            .listCollections({ name: collectionName }, { nameOnly: true })
            .next()
    );
}

async function auditCollection({ db, collectionName, expectedIndexes }) {
    if (!(await collectionExists(db, collectionName))) {
        console.log(`INDEX_AUDIT_SKIP collection=${collectionName} reason=collection_absent`);
        return { checked: false, errors: false, extras: 0 };
    }

    const result = auditCollectionIndexes({
        expectedIndexes,
        actualIndexes: await db.collection(collectionName).indexes(),
    });

    for (const missing of result.missing) {
        console.error(`ERROR index_audit_missing collection=${collectionName} expected=${serializeIndex(missing)}`);
    }
    for (const mismatch of result.mismatched) {
        console.error(`ERROR index_audit_mismatch collection=${collectionName} detail=${serializeIndex(mismatch)}`);
    }
    for (const extra of result.extra) {
        console.warn(`WARNING index_audit_extra collection=${collectionName} actual=${serializeIndex(extra)}`);
    }
    if (!hasIndexAuditErrors(result) && result.extra.length === 0) {
        console.log(`INDEX_AUDIT_OK collection=${collectionName} expected=${expectedIndexes.length}`);
    }

    return {
        checked: true,
        errors: hasIndexAuditErrors(result),
        extras: result.extra.length,
    };
}

async function main() {
    if (!process.env.MONGO_URI) throw new Error("missing_mongo_uri");

    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    let checkedCollections = 0;
    let errors = 0;
    let extras = 0;

    try {
        for (const model of MODELS) {
            const result = await auditCollection({
                db,
                collectionName: model.collection.name,
                expectedIndexes: model.schema.indexes(),
            });
            checkedCollections += Number(result.checked);
            errors += Number(result.errors);
            extras += result.extras;
        }

        const migrationResult = await auditCollection({
            db,
            collectionName: "schemamigrations",
            expectedIndexes: [[{ id: 1 }, { unique: true, name: "id_1" }]],
        });
        checkedCollections += Number(migrationResult.checked);
        errors += Number(migrationResult.errors);
        extras += migrationResult.extras;

        const status = errors > 0 ? "ERROR" : "OK";
        console.log(`INDEX_AUDIT_COMPLETE status=${status} checked_collections=${checkedCollections} errors=${errors} extras=${extras}`);
        if (errors > 0) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error(`ERROR index_audit_failed reason=${error.message}`);
    process.exitCode = 1;
});
