export function registerErrorHandlers(app) {
    app.use((err, _req, res, next) => {
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
