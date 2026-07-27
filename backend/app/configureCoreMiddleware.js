import express from "express";
import cors from "cors";

import { createCorsOriginDelegate } from "../security/originProtection.js";
import { createRequestContextMiddleware, getRequestContext } from "./requestContext.js";
import { logSafeError } from "../utils/requestLogSafety.js";

// A backend reachable directly must not trust forwarding headers. Production
// deployments can opt into their exact reverse-proxy CIDR through the env var.
const DEFAULT_TRUSTED_PROXY_CIDRS = ["loopback"];
const AI_ANALYZE_BODY_LIMIT = "16kb";
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "report-uri /api/security/csp-reports",
    "upgrade-insecure-requests",
].join("; ");

export function getTrustedProxyCidrs(env = process.env) {
    const configuredCidrs = String(env.CLINIA_TRUST_PROXY_CIDRS || "")
        .split(",")
        .map((cidr) => cidr.trim())
        .filter(Boolean);

    return configuredCidrs.length > 0
        ? configuredCidrs
        : DEFAULT_TRUSTED_PROXY_CIDRS;
}

export function createSecurityHeadersMiddleware() {
    return (req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Permissions-Policy", "geolocation=(), microphone=()");
        res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);

        const isProd = process.env.NODE_ENV === "production";
        const hostHeader = String(req.headers.host || "").toLowerCase();
        const hostname = hostHeader.split(":")[0];
        const isLocalHostRequest =
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1";
        // Express only sets req.secure from X-Forwarded-Proto when the remote
        // peer matches the explicit trust proxy configuration below.
        const isSecure = req.secure === true;

        const requestContext = getRequestContext(req);
        if (isProd && !isSecure && !isLocalHostRequest) {
            logSafeError("HTTPS_BLOCKED", null, {
                requestId: requestContext.requestId,
                component: "https",
                status: 400,
            });
            return res.status(400).json({
                error: {
                    code: "HTTPS_REQUIRED",
                    message: "HTTPS est requis.",
                    retryable: false,
                },
            });
        }

        if (isSecure) {
            res.setHeader(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains"
            );
        }

        return next();
    };
}

export function configureCoreMiddleware(app) {
    app.set("trust proxy", getTrustedProxyCidrs());
    app.use(createRequestContextMiddleware());
    app.use(
        cors({
            origin: createCorsOriginDelegate(),
            credentials: true,
        })
    );
    // This public endpoint only accepts a compact clinical DTO. Parse it first
    // with a dedicated limit so the generic API limit cannot be abused here.
    app.use("/api/ai/analyze", express.json({ limit: AI_ANALYZE_BODY_LIMIT }));
    app.use(express.json({ limit: "1mb" }));
    app.use(createSecurityHeadersMiddleware());
}
