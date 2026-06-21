import express from "express";
import { getDbStatus } from "../services/dbStatus.js";

const router = express.Router();

router.get("/", async (_req, res) => {
    try {
        const data = await getDbStatus();

        return res.status(200).json({
            data,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        console.error("❌ DB status error:", err);

        return res.status(500).json({
            error: {
                code: "DB_STATUS_FAILED",
                message: "Impossible de recuperer l'etat des bases de donnees.",
                retryable: true,
            },
        });
    }
});

export default router;
