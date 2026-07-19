import express from "express";

import { cspReportRateLimiter } from "../middleware/cspReportRateLimiter.js";
import { createSecurityIncident } from "../services/securityIncidents.js";

const router = express.Router();
const ALLOWED_DIRECTIVES = new Set([
    "base-uri",
    "connect-src",
    "default-src",
    "font-src",
    "form-action",
    "frame-ancestors",
    "frame-src",
    "img-src",
    "object-src",
    "script-src",
    "style-src",
]);

function normalizeDirective(value) {
    const directive = String(value || "").trim().toLowerCase();
    return ALLOWED_DIRECTIVES.has(directive) ? directive : null;
}

function classifyBlockedResource(value) {
    const blocked = String(value || "").trim().toLowerCase();

    if (["inline", "eval", "wasm-eval"].includes(blocked)) return blocked;
    if (blocked.startsWith("data:")) return "data";
    if (blocked.startsWith("blob:")) return "blob";
    return blocked ? "external" : "unknown";
}

export function toSafeCspViolation(report) {
    const payload = report && typeof report === "object" ? report : {};
    const directive = normalizeDirective(
        payload["effective-directive"] || payload["violated-directive"]
    );

    if (!directive) return null;

    return {
        type: "CSP_VIOLATION",
        phase: "client_enforcement",
        reason: "La politique de securite du navigateur a bloque une ressource non autorisee.",
        // Browser-provided document and blocked URLs are never persisted.
        requestPath: "/client",
        transport: "browser_csp",
        matches: [],
        context: {
            directive,
            resource: classifyBlockedResource(payload["blocked-uri"]),
        },
    };
}

function extractReports(body) {
    if (Array.isArray(body)) {
        return body
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => entry.body)
            .filter((entry) => entry && typeof entry === "object");
    }

    if (body && typeof body === "object" && body["csp-report"]) {
        return [body["csp-report"]];
    }

    return [];
}

router.post(
    "/",
    express.json({
        type: ["application/csp-report", "application/reports+json"],
        limit: "16kb",
    }),
    cspReportRateLimiter,
    async (req, res) => {
        try {
            const safeViolations = extractReports(req.body)
                .map(toSafeCspViolation)
                .filter(Boolean)
                .slice(0, 5);

            await Promise.all(safeViolations.map(createSecurityIncident));
        } catch {
            // Do not reveal security telemetry persistence state to a browser.
        }

        return res.status(204).end();
    }
);

export default router;
