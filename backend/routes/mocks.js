import express from "express";
import { getAllMocks, saveAllMocks } from "../utils/mockLoader.js";

const router = express.Router();

router.get("/", (_req, res) => {
    try {
        return res.status(200).json(getAllMocks());
    } catch (err) {
        console.error("❌ Mock Studio load error:", err);
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

        console.error("❌ Mock Studio save error:", err);
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
