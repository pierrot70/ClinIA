import express from "express";
import mongoose from "mongoose";
import { getRequestContext } from "../app/requestContext.js";

const router = express.Router();

function buildHealthMeta(req) {
    return { source: "real", model: "health", ...getRequestContext(req) };
}

export function getLiveness(req, res) {
    return res.status(200).json({
        data: {
            status: "ok",
            check: "liveness",
        },
        meta: buildHealthMeta(req),
    });
}

export function createReadinessHandler({
    connection = mongoose.connection,
} = {}) {
    return function getReadiness(req, res) {
        const mongoConnected = connection?.readyState === 1;

        return res.status(mongoConnected ? 200 : 503).json({
            data: {
                status: mongoConnected ? "ok" : "unavailable",
                check: "readiness",
                dependencies: {
                    mongo: mongoConnected ? "connected" : "unavailable",
                },
            },
            meta: buildHealthMeta(req),
        });
    };
}

router.get("/live", getLiveness);
router.get("/ready", createReadinessHandler());

export default router;
