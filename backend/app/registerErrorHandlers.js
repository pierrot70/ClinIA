export function registerErrorHandlers(app) {
    app.use((err, _req, res, next) => {
        if (err?.type === "entity.too.large") {
            return res.status(413).json({
                error: {
                    code: "CLINICAL_REQUEST_TOO_LARGE",
                    message:
                        "La requete clinique depasse la taille autorisee.",
                    retryable: false,
                },
            });
        }

        if (err?.code === "CORS_ORIGIN_DENIED") {
            return res.status(403).json({
                error: {
                    code: "CORS_ORIGIN_DENIED",
                    message: "Origine CORS non autorisee.",
                    retryable: false,
                },
            });
        }

        return next(err);
    });
}
