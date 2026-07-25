import express from "express";
import { getAllMocks, saveAllMocks } from "../utils/mockLoader.js";
import { logSafeError } from "../utils/requestLogSafety.js";

const router = express.Router();

router.get("/", (_req, res) => {
    try {
        return res.status(200).json(getAllMocks());
    } catch (err) {
        logSafeError("MOCK_LOAD_FAILED", err);
        return res.status(500).json({
            error: {
                code: "MOCK_LOAD_FAILED",
                message: "Impossible de charger les mocks.",
                retryable: true,
            },
        });
    }
});

router.put("/", (req, res) => {
    try {
        saveAllMocks(req.body);
        return res.status(200).json({
            data: {
                saved: true,
            },
            meta: {
                source: "file",
            },
        });
    } catch (err) {
        const isValidationError =
            err instanceof Error && err.message === "Invalid mock data";

        if (isValidationError) {
            return res.status(400).json({
                error: {
                    code: "INVALID_INPUT",
                    message: "Format de mocks invalide.",
                    retryable: false,
                },
            });
        }

        logSafeError("MOCK_SAVE_FAILED", err);
        return res.status(500).json({
            error: {
                code: "MOCK_SAVE_FAILED",
                message: "Impossible de sauvegarder les mocks.",
                retryable: true,
            },
        });
    }
});

export default router;
