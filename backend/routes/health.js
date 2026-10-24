import express from "express";
import mongoose from "mongoose";
import { getRequestContext } from "../app/requestContext.js";
import { deployedVersion } from "../services/validationReports.js";

const router = express.Router();

async function buildHealthMeta(req) {
    return { source: "real", model: "health", ...getRequestContext(req), deployment: await deployedVersion() };
}

export async function getLiveness(req, res) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
        data: {
            status: "ok",
            check: "liveness",
        },
        meta: await buildHealthMeta(req),
    });
}

export function createReadinessHandler({
    connection = mongoose.connection,
} = {}) {
    return async function getReadiness(req, res) {
        res.setHeader("Cache-Control", "no-store");
        const mongoConnected = connection?.readyState === 1;

        return res.status(mongoConnected ? 200 : 503).json({
            data: {
                status: mongoConnected ? "ok" : "unavailable",
                check: "readiness",
                dependencies: {
                    mongo: mongoConnected ? "connected" : "unavailable",
                },
            },
            meta: await buildHealthMeta(req),
        });
    };
}

router.get("/live", getLiveness);
router.get("/ready", createReadinessHandler());

export default router;
