import express from "express";
import { getDbStatus, setBackupProtection } from "../services/dbStatus.js";
import { logSafeError } from "../utils/requestLogSafety.js";

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
        logSafeError("DB_STATUS_FAILED", err);

        return res.status(500).json({
            error: {
                code: "DB_STATUS_FAILED",
                message: "Impossible de recuperer l'etat des bases de donnees.",
                retryable: true,
            },
        });
    }
});

router.post("/backups/:fileName/protection", async (req, res) => {
    try {
        const data = await setBackupProtection({
            fileName: req.params.fileName,
            protectedValue: true,
        });

        return res.status(200).json({ data });
    } catch (err) {
        logSafeError("DB_BACKUP_PROTECTION_FAILED", err);

        return res.status(400).json({
            error: {
                code: "BACKUP_PROTECTION_FAILED",
                message: "Impossible de conserver ce backup.",
                retryable: false,
            },
        });
    }
});

router.delete("/backups/:fileName/protection", async (req, res) => {
    try {
        const data = await setBackupProtection({
            fileName: req.params.fileName,
            protectedValue: false,
        });

        return res.status(200).json({ data });
    } catch (err) {
        logSafeError("DB_BACKUP_PROTECTION_REMOVAL_FAILED", err);

        return res.status(400).json({
            error: {
                code: "BACKUP_PROTECTION_REMOVAL_FAILED",
                message: "Impossible de retirer la conservation de ce backup.",
                retryable: false,
            },
        });
    }
});

export default router;
