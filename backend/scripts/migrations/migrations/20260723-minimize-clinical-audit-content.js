import {
    minimizeAcknowledgmentContext,
    minimizeOpenAIRequestContext,
    minimizePatientAuditContext,
    minimizeSecurityIncidentContext,
    minimizeSecurityIncidentMatches,
} from "../../../audit/auditDataMinimization.js";

const BULK_SIZE = 250;

async function flush(collection, operations, session) {
    if (!operations.length) return;
    await collection.bulkWrite(operations.splice(0, operations.length), {
        ordered: false,
        session,
    });
}

function sameJson(left, right) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function snapshotFromLegacyAudit(log) {
    const secureRequest = log?.context?.secureRequest;
    const clinicalScope = typeof secureRequest?.clinicalScope === "string"
        ? secureRequest.clinicalScope.trim().slice(0, 160)
        : "";
    if (!log?.patientId || !clinicalScope) return null;

    const selectedDocumentIds = Array.isArray(secureRequest.selectedDocumentIds)
        ? Array.from(new Set(secureRequest.selectedDocumentIds
            .filter((value) => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)))
        : [];
    return {
        patientId: log.patientId,
        clinicalScope,
        clinicalScopeKey: clinicalScope.toLocaleLowerCase(),
        objective: typeof secureRequest.objective === "string"
            ? secureRequest.objective.trim().slice(0, 500)
            : "",
        selectedDocumentIds,
        source: "legacy_patient_audit",
        createdAt: log.timestamp || new Date(),
        updatedAt: log.timestamp || new Date(),
    };
}

export const migration = {
    id: "20260723-minimize-clinical-audit-content",
    description:
        "Moves retained secure-request selections out of audits and removes clinical content from historical audit metadata.",
    reversible: false,
    transactional: false,
    fingerprint: "clinical-audit-minimization-v1",

    async up({ db, session }) {
        const patientAudits = db.collection("patientauditlogs");
        const snapshots = db.collection("patientsecurerequestsnapshots");
        await snapshots.createIndex(
            { patientId: 1, clinicalScopeKey: 1 },
            { unique: true, ...(session ? { session } : {}) }
        );

        const patientUpdates = [];
        const snapshotUpdates = [];
        const patientCursor = patientAudits.find(
            { context: { $type: "object" } },
            {
                session,
                projection: { patientId: 1, context: 1, timestamp: 1 },
                sort: { timestamp: -1, _id: -1 },
            }
        );
        for await (const log of patientCursor) {
            const snapshot = snapshotFromLegacyAudit(log);
            if (snapshot) {
                snapshotUpdates.push({
                    updateOne: {
                        filter: {
                            patientId: snapshot.patientId,
                            clinicalScopeKey: snapshot.clinicalScopeKey,
                        },
                        update: { $setOnInsert: snapshot },
                        upsert: true,
                    },
                });
            }
            const context = minimizePatientAuditContext(log.context);
            if (!sameJson(context, log.context)) {
                patientUpdates.push({
                    updateOne: { filter: { _id: log._id }, update: { $set: { context } } },
                });
            }
            if (patientUpdates.length >= BULK_SIZE) await flush(patientAudits, patientUpdates, session);
            if (snapshotUpdates.length >= BULK_SIZE) await flush(snapshots, snapshotUpdates, session);
        }
        await flush(patientAudits, patientUpdates, session);
        await flush(snapshots, snapshotUpdates, session);

        const openAiAudits = db.collection("openairequestauditlogs");
        const openAiUpdates = [];
        const openAiCursor = openAiAudits.find(
            { requestContext: { $type: "object" } },
            { session, projection: { requestContext: 1 } }
        );
        for await (const audit of openAiCursor) {
            const requestContext = minimizeOpenAIRequestContext(audit.requestContext);
            if (!sameJson(requestContext, audit.requestContext)) {
                openAiUpdates.push({ updateOne: { filter: { _id: audit._id }, update: { $set: { requestContext } } } });
            }
            if (openAiUpdates.length >= BULK_SIZE) await flush(openAiAudits, openAiUpdates, session);
        }
        await flush(openAiAudits, openAiUpdates, session);

        const incidents = db.collection("securityincidents");
        const incidentUpdates = [];
        const incidentCursor = incidents.find({}, {
            session,
            projection: { type: 1, matches: 1, context: 1, acknowledgmentContext: 1 },
        });
        for await (const incident of incidentCursor) {
            const update = {};
            const matches = minimizeSecurityIncidentMatches(incident.matches);
            const context = minimizeSecurityIncidentContext(incident.type, incident.context);
            const acknowledgmentContext = minimizeAcknowledgmentContext(incident.acknowledgmentContext);
            if (!sameJson(matches, incident.matches)) update.matches = matches;
            if (!sameJson(context, incident.context)) update.context = context;
            if (!sameJson(acknowledgmentContext, incident.acknowledgmentContext)) {
                update.acknowledgmentContext = acknowledgmentContext;
            }
            if (Object.keys(update).length) {
                incidentUpdates.push({ updateOne: { filter: { _id: incident._id }, update: { $set: update } } });
            }
            if (incidentUpdates.length >= BULK_SIZE) await flush(incidents, incidentUpdates, session);
        }
        await flush(incidents, incidentUpdates, session);
    },
};
