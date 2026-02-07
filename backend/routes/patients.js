import express from "express";
import {
    createPatient,
    listPatients,
    getPatientById,
    updatePatient,
    deletePatient,
} from "../services/patients.js";
import {
    toCreatePatientDTO,
    toUpdatePatientDTO,
} from "../dto/patient.dto.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/* POST /api/patients                                                  */
/* ------------------------------------------------------------------ */

router.post("/", async (req, res) => {
    const dto = toCreatePatientDTO(req.body);

    if (!dto.nom || !dto.prenom) {
        return res.status(400).json({
            error: {
                code: "INVALID_INPUT",
                message:
                    "Champs requis manquants (nom, prenom).",
                retryable: false,
            },
        });
    }

    try {
        const patient = await createPatient(dto);

        return res.status(201).json({
            data: patient,
            meta: {
                source: "real",
                model: "mongo",
            },
        });
    } catch (err) {
        if (err.code === "RAMQ_GENERATION_FAILED") {
            return res.status(500).json({
                error: {
                    code: err.code,
                    message: err.message,
                    retryable: true,
                },
            });
        }

        if (err.code === 11000) {
            return res.status(409).json({
                error: {
                    code: "PATIENT_CONFLICT",
                    message:
                        "Ce numéro d'assurance maladie existe déjà.",
                    retryable: false,
                },
            });
        }

        console.error("❌ Patient create error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible d’enregistrer le patient.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/patients (PAGINATION BACKEND)                              */
/* ------------------------------------------------------------------ */

router.get("/", async (req, res) => {
    try {
        const { data, meta } = await listPatients(
            {
                nom: req.query.nom,
                prenom: req.query.prenom,
                num_assurance_maladie:
                    req.query.num_assurance_maladie,
                telephone: req.query.telephone,
                addresse: req.query.addresse,
            },
            {
                page: req.query.page,
                limit: req.query.limit,
                sortBy: req.query.sortBy,
                sortDir: req.query.sortDir,
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
        console.error("❌ Patient list error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer les patients.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* GET /api/patients/:id                                               */
/* ------------------------------------------------------------------ */

router.get("/:id", async (req, res) => {
    try {
        const patient = await getPatientById(req.params.id);

        return res.status(200).json({
            data: patient,
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

        console.error("❌ Patient get error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de récupérer le patient.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* PATCH /api/patients/:id                                             */
/* ------------------------------------------------------------------ */

router.patch("/:id", async (req, res) => {
    const dto = toUpdatePatientDTO(req.body);

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
        const patient = await updatePatient(req.params.id, dto);

        return res.status(200).json({
            data: patient,
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

        if (err.code === 11000) {
            return res.status(409).json({
                error: {
                    code: "PATIENT_CONFLICT",
                    message:
                        "Ce numéro d'assurance maladie existe déjà.",
                    retryable: false,
                },
            });
        }

        console.error("❌ Patient update error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de mettre à jour le patient.",
                retryable: true,
            },
        });
    }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/patients/:id                                            */
/* ------------------------------------------------------------------ */

router.delete("/:id", async (req, res) => {
    try {
        const deleted = await deletePatient(req.params.id);

        return res.status(200).json({
            data: deleted,
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

        console.error("❌ Patient delete error:", err);

        return res.status(500).json({
            error: {
                code: "PERSISTENCE_FAILED",
                message:
                    "Impossible de supprimer le patient.",
                retryable: true,
            },
        });
    }
});

export default router;
