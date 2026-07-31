import { logSafeError } from "../utils/requestLogSafety.js";
import { assertConfiguredOpenAIModel } from "../services/aiModelPolicy.js";

function getMongoUsername(mongoUri) {
    const match = String(mongoUri || "").match(
        /^mongodb(?:\+srv)?:\/\/([^:@/]+)(?::[^@]*)?@/i
    );

    if (!match) {
        return null;
    }

    try {
        return decodeURIComponent(match[1]).trim().toLowerCase();
    } catch {
        return match[1].trim().toLowerCase();
    }
}

export function assertProductionMongoLeastPrivilege({ mongoUri, nodeEnv }) {
    if (!mongoUri) {
        throw new Error("MONGO_URI is required.");
    }

    if (nodeEnv === "production" && getMongoUsername(mongoUri) === "root") {
        throw new Error(
            "Production MONGO_URI must use a dedicated non-root application user."
        );
    }
}

export function createStartServer(deps) {
    const {
        mongoose,
        initShutdownState,
        registerGracefulShutdown,
        logger = console,
        port = 4000,
        mongoUri = process.env.MONGO_URI,
        nodeEnv = process.env.NODE_ENV,
        mockAi = process.env.CLINIA_MOCK_AI,
        openaiModel = process.env.OPENAI_MODEL,
    } = deps;

    return async function startServer({ app }) {
        try {
            assertConfiguredOpenAIModel(openaiModel);
        } catch (err) {
            logSafeError("OPENAI_MODEL_CONFIGURATION_INVALID", err, {
                logger,
                component: "config",
            });
            return;
        }

        return Promise.resolve()
            .then(() => {
                assertProductionMongoLeastPrivilege({ mongoUri, nodeEnv });
            })
            .then(() => mongoose
            .connect(mongoUri, {
                serverSelectionTimeoutMS: 2000,
            }))
            .then(async () => {
                logger.log("✅ MongoDB connecté (ClinIA)");
                logger.log("CLINIA_MOCK_AI =", mockAi);
                logger.log("OPENAI_MODEL =", openaiModel);

                try {
                    await initShutdownState();
                    logger.log("✅ Maintenance state chargé depuis MongoDB");
                } catch (err) {
                    logSafeError("APP_SHUTDOWN_STATE_INIT_FAILED", err, {
                        logger,
                        component: "mongo",
                    });
                }

                const server = app.listen(port, () =>
                    logger.log(
                        `🚀 ClinIA backend ready on http://localhost:${port}`
                    )
                );

                registerGracefulShutdown?.({
                    server,
                    mongoose,
                    logger,
                });

                return server;
            })
            .catch((err) => {
                logSafeError("MONGO_CONNECTION_FAILED", err, {
                    logger,
                    component: "mongo",
                });
            });
    };
}
