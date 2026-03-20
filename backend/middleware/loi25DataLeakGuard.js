import { detectNonSecureContent, buildBlockingIncidentResponse } from "../utils/securityIncident.js";

// Middleware global Loi 25 : bloque la fuite de données identifiables dans les requêtes et réponses API
export function loi25DataLeakGuard(req, res, next) {
    // Scan du body entrant (requête)
    if (req.body && typeof req.body === "object") {
        const scan = detectNonSecureContent(req.body);
        if (scan.hasMatches) {
            // Bloque la requête et retourne une alerte sécurité
            return res.status(422).json(
                buildBlockingIncidentResponse({
                    phase: "pre_api",
                    reason: "Identifiants patients détectés dans la requête API.",
                    matches: scan.matches,
                    context: { route: req.originalUrl, method: req.method },
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
                        phase: "post_api",
                        reason: "Identifiants patients détectés dans la réponse API.",
                        matches: scan.matches,
                        context: { route: req.originalUrl, method: req.method },
                    })
                );
            }
        }
        return originalJson.call(this, data);
    };

    next();
}
