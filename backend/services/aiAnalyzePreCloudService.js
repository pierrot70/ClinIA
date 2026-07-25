function buildClinicalPayloadBinding(patient) {
    if (!patient || typeof patient !== "object" || Array.isArray(patient)) {
        return {};
    }

    const clinicalPayload = { ...patient };

    // These fields control the request lifecycle; they are not clinical content.
    delete clinicalPayload.incidentAckId;
    delete clinicalPayload.forceReal;
    delete clinicalPayload.openaiModel;
    delete clinicalPayload.reverifyRequested;

    return clinicalPayload;
}

export async function resolvePreCloudSecurityState({
    patient,
    incidentAckId,
    model,
    reqAuth,
    req,
    fingerprint,
    diagnosis,
    symptoms,
    detectNonSecureContent,
    getAcknowledgedSecurityIncident,
    respondWithSecurityIncident,
    getRequestIp,
    makeSourceHash,
    sanitizeNonSecureContent,
    res,
    forceRealSafe,
}) {
    const preCloudScan = detectNonSecureContent(patient);
    if (!preCloudScan.hasMatches) {
        return {
            blocked: false,
            neutralizationMeta: null,
        };
    }

    const payloadHash = makeSourceHash(buildClinicalPayloadBinding(patient));
    const ackedIncident = incidentAckId
        ? await getAcknowledgedSecurityIncident(incidentAckId, payloadHash)
        : null;

    if (!ackedIncident) {
        return {
            blocked: true,
            response: await respondWithSecurityIncident({
                res,
                phase: "pre_cloud",
                reason:
                    "Non-secure patient identifiers detected before cloud transmission.",
                requestPath: "/api/ai/analyze",
                matches: preCloudScan.matches,
                context: {
                    model,
                    direction: "request",
                },
                auditEvent: {
                    actorUserId: reqAuth?.userId ?? null,
                    actorUsername: reqAuth?.username ?? null,
                    actorRole: reqAuth?.role ?? null,
                    ip: getRequestIp(req),
                    model,
                    payloadHash,
                    payloadSizeBytes: Buffer.byteLength(
                        JSON.stringify(patient),
                        "utf8"
                    ),
                    requestContext: {
                        fingerprint,
                        diagnosisHash: makeSourceHash({ diagnosis }),
                        symptomCount: Array.isArray(symptoms)
                            ? symptoms.length
                            : 0,
                        medicalHistoryCount: Array.isArray(patient.medical_history)
                            ? patient.medical_history.length
                            : 0,
                        currentMedicationCount: Array.isArray(
                            patient.current_medications
                        )
                            ? patient.current_medications.length
                            : 0,
                        forceReal: forceRealSafe,
                        direction: "request",
                    },
                },
            }),
        };
    }

    const sanitizedPatient = sanitizeNonSecureContent(patient);

    return {
        blocked: false,
        sanitizedPatient,
        neutralizationMeta: {
            neutralized: true,
            acknowledgmentIncidentId: String(ackedIncident._id),
            originalMatches: preCloudScan.matches,
            message:
                "Requete contenant des donnees sensibles neutralisee apres acknowledgment explicite du clinicien.",
        },
    };
}
