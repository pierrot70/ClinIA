export function createStartServer(deps) {
    const {
        mongoose,
        initShutdownState,
        logger = console,
        port = 4000,
        mongoUri = process.env.MONGO_URI,
        nodeEnv = process.env.NODE_ENV,
        mockAi = process.env.CLINIA_MOCK_AI,
        openaiModel = process.env.OPENAI_MODEL,
    } = deps;

    return async function startServer({ app, warmTranslationMemoryCache }) {
        return mongoose
            .connect(mongoUri, {
                serverSelectionTimeoutMS: 2000,
            })
            .then(async () => {
                logger.log("✅ MongoDB connecté (ClinIA)");
                logger.log("CLINIA_MOCK_AI =", mockAi);
                logger.log("OPENAI_MODEL =", openaiModel);

                try {
                    await warmTranslationMemoryCache();
                } catch (err) {
                    logger.warn("⚠️ I18N warmup failed", err?.message);
                }

                try {
                    await initShutdownState();
                    logger.log("✅ Maintenance state chargé depuis MongoDB");
                } catch (err) {
                    logger.warn("⚠️ initShutdownState failed", err?.message);
                }

                app.listen(port, () =>
                    logger.log(
                        `🚀 ClinIA backend ready on http://localhost:${port}`
                    )
                );
            })
            .catch((err) => {
                logger.error("❌ Mongo connection error (FAIL-FAST):", err.message);
            });
    };
}
