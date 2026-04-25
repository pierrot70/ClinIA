import express from "express";
import {
    deleteUiTranslation,
    listUiTranslations,
    updateUiTranslation,
} from "../services/translationAdmin.js";

const router = express.Router();

function sendError(res, err, fallbackCode, fallbackMessage) {
    if (err.code === "FORBIDDEN") {
        return res.status(403).json({
            error: {
                code: err.code,
                message: err.message,
                retryable: false,
            },
        });
    }

    if (err.code === "INVALID_INPUT") {
        return res.status(400).json({
            error: {
                code: err.code,
                message: err.message,
                retryable: false,
            },
        });
    }

    if (err.code === "NOT_FOUND") {
        return res.status(404).json({
            error: {
                code: err.code,
                message: err.message,
                retryable: false,
            },
        });
    }

    console.error("❌ Translation admin error:", err?.code || err?.message);
    return res.status(500).json({
        error: {
            code: fallbackCode,
            message: fallbackMessage,
            retryable: true,
        },
    });
}

router.get("/", async (req, res) => {
    try {
        const data = await listUiTranslations({
            authUser: req.auth,
            page: req.query.page,
            limit: req.query.limit,
            namespace: req.query.namespace,
            targetLang: req.query.targetLang,
            sourceLocale: req.query.sourceLocale,
            search: req.query.search,
        });

        return res.status(200).json({
            data,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        return sendError(
            res,
            err,
            "TRANSLATION_ADMIN_LIST_FAILED",
            "Impossible de lister les traductions."
        );
    }
});

router.put("/:id", async (req, res) => {
    try {
        const data = await updateUiTranslation({
            authUser: req.auth,
            translationId: req.params.id,
            payload: req.body?.payload,
            sourceText: req.body?.sourceText,
            voiceAck: req.body?.voiceAck,
            voicePrompts: req.body?.voicePrompts,
            req,
        });

        return res.status(200).json({
            data,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        return sendError(
            res,
            err,
            "TRANSLATION_ADMIN_UPDATE_FAILED",
            "Impossible de modifier la traduction."
        );
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const data = await deleteUiTranslation({
            authUser: req.auth,
            translationId: req.params.id,
            req,
        });

        return res.status(200).json({
            data,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        return sendError(
            res,
            err,
            "TRANSLATION_ADMIN_DELETE_FAILED",
            "Impossible de supprimer la traduction."
        );
    }
});

export default router;
