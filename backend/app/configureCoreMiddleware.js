import express from "express";
import cors from "cors";

import { createCorsOriginDelegate } from "../security/originProtection.js";
import { createRequestContextMiddleware, getRequestContext } from "./requestContext.js";
import { getSafeRequestPath } from "../utils/requestLogSafety.js";

export function createSecurityHeadersMiddleware() {
    return (req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Permissions-Policy", "geolocation=(), microphone=()");

        const isProd = process.env.NODE_ENV === "production";
        const forwardedProto = req.headers["x-forwarded-proto"];
        const hostHeader = String(req.headers.host || "").toLowerCase();
        const hostname = hostHeader.split(":")[0];
        const isLocalHostRequest =
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1";
        const isSecure =
            req.secure ||
            (typeof forwardedProto === "string" &&
                forwardedProto.toLowerCase().includes("https"));

        const requestContext = getRequestContext(req);
        if (isProd && !isSecure && !isLocalHostRequest) {
            console.warn("[HTTPS BLOCKED]", {
                method: req.method,
                path: getSafeRequestPath(req, "/"),
                ...requestContext,
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
    app.set("trust proxy", 1);
    app.use(createRequestContextMiddleware());
    app.use(
        cors({
            origin: createCorsOriginDelegate(),
            credentials: true,
        })
    );
    app.use(express.json({ limit: "1mb" }));
    app.use(createSecurityHeadersMiddleware());
}
