import express from "express";
import {
    createClinique,
    listCliniques,
    getCliniqueById,
    updateClinique,
    deleteClinique,
} from "../services/cliniques.js";
import {
    toCreateCliniqueDTO,
    toUpdateCliniqueDTO,
} from "../dto/clinique.dto.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/* POST /api/cliniques                                                 */
/* ------------------------------------------------------------------ */

router.post("/", async (req, res) => {
    const dto = toCreateCliniqueDTO(req.body);

    if (!dto.num_civique || !dto.rue || !dto.code_postal) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Champs requis manquants (num_civique, rue, code_postal).",
                retryable: false,
            },
        });
    }

    try {
        const clinique = await createClinique(dto);

        return res.status(201).json({
            data: clinique,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_INPUT") {
            return res.status(400).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: false,
                },
            });
        }

        console.error("❌ Clinique create error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible d’enregistrer la clinique.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/cliniques (PAGINATION)                                     */
/* ------------------------------------------------------------------ */

router.get("/", async (req, res) => {
    try {
        const { data, meta } = await listCliniques(
            {
                rue: req.query.rue,
                code_postal: req.query.code_postal,
            },
            {
                page: req.query.page,
                limit: req.query.limit,
            }
        );

        return res.status(200).json({
            data: {
                data,
                meta: {
                    ...meta,
                    source: "real",
                    model: "mongo",
                },
            },
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        console.error("❌ Clinique list error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer les cliniques.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/cliniques/:id                                              */
/* ------------------------------------------------------------------ */

router.get("/:id", async (req, res) => {
    try {
        const clinique = await getCliniqueById(req.params.id);

        return res.status(200).json({
            data: clinique,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_ID") {
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

        console.error("❌ Clinique get error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer la clinique.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* PATCH /api/cliniques/:id                                            */
/* ------------------------------------------------------------------ */

router.patch("/:id", async (req, res) => {
    const dto = toUpdateCliniqueDTO(req.body);

    if (Object.keys(dto).length === 0) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Aucun champ valide fourni pour la mise à jour.",
                retryable: false,
            },
        });
    }

    try {
        const clinique = await updateClinique(req.params.id, dto);

        return res.status(200).json({
            data: clinique,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (
            err.code === "INVALID_ID" ||
            err.code === "INVALID_INPUT"
        ) {
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

        console.error("❌ Clinique update error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de mettre à jour la clinique.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/cliniques/:id                                           */
/* ------------------------------------------------------------------ */

router.delete("/:id", async (req, res) => {
    try {
        await deleteClinique(req.params.id);

        return res.status(200).json({
            data: null,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === "INVALID_ID") {
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

        console.error("❌ Clinique delete error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de supprimer la clinique.",
                retryable: true,
            },
        });
    }
});

export default router;
