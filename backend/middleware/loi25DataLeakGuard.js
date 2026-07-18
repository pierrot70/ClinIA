import { detectNonSecureContent, buildBlockingIncidentResponse } from "../utils/securityIncident.js";
import { getSafeRequestPath } from "../utils/requestLogSafety.js";

function shouldEnforceCloudSafety(req) {
    return Boolean(req?.cliniaCloudSafety?.enforce === true);
}

function buildIncidentContext(req) {
    return {
        route: getSafeRequestPath(req, "/"),
        method: req.method,
        ...(req?.cliniaCloudSafety?.context || {}),
    };
}

// Middleware Loi 25 opt-in : réservé aux flux explicitement marqués comme transmission cloud.
export function loi25DataLeakGuard(req, res, next) {
    if (!shouldEnforceCloudSafety(req)) {
        return next();
    }

    // Scan du body entrant (requête)
    if (req.body && typeof req.body === "object") {
        const scan = detectNonSecureContent(req.body);
        if (scan.hasMatches) {
            // Bloque la requête et retourne une alerte sécurité
            return res.status(422).json(
                buildBlockingIncidentResponse({
                    phase: req?.cliniaCloudSafety?.prePhase || "pre_cloud",
                    reason:
                        req?.cliniaCloudSafety?.preReason ||
                        "Identifiants patients detectes avant transmission cloud.",
                    matches: scan.matches,
                    context: buildIncidentContext(req),
                })
            );
        }
    }

    // Capture la réponse JSON pour scanner le payload sortant
    const originalJson = res.json;
    res.json = function (data) {
        if (data && typeof data === "object") {
            const scan = detectNonSecureContent(data);
            if (scan.hasMatches) {
                return res.status(422).json(
                    buildBlockingIncidentResponse({
                        phase: req?.cliniaCloudSafety?.postPhase || "post_cloud",
                        reason:
                            req?.cliniaCloudSafety?.postReason ||
                            "Identifiants patients detectes apres transmission cloud.",
                        matches: scan.matches,
                        context: buildIncidentContext(req),
                    })
                );
            }
        }
        return originalJson.call(this, data);
    };

    next();
}
