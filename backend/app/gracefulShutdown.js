import { logSafeError } from "../utils/requestLogSafety.js";

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export function registerGracefulShutdown({
    server,
    mongoose,
    logger = console,
    processRef = process,
    timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
}) {
    let shuttingDown = false;

    async function finishShutdown({ signal, timeout, exitCode = 0 }) {
        try {
            await mongoose.disconnect();
            logger.log(`[shutdown] MongoDB disconnected after ${signal}`);
        } catch (err) {
            exitCode = 1;
            logSafeError("SHUTDOWN_MONGO_DISCONNECT_FAILED", err, {
                logger,
                component: "shutdown",
            });
        } finally {
            clearTimeoutFn(timeout);
            processRef.exit(exitCode);
        }
    }

    function shutdown(signal, exitCode = 0) {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        logger.log(`[shutdown] ${signal} received; draining HTTP connections`);

        const timeout = setTimeoutFn(() => {
            logSafeError("SHUTDOWN_TIMEOUT", null, {
                logger,
                component: "shutdown",
                status: 503,
            });
            processRef.exit(1);
        }, timeoutMs);
        timeout?.unref?.();

        server.close((err) => {
            if (err) {
                logSafeError("SHUTDOWN_HTTP_CLOSE_FAILED", err, {
                    logger,
                    component: "shutdown",
                });
                finishShutdown({ signal, timeout, exitCode: 1 });
                return;
            }

            logger.log(`[shutdown] HTTP server closed after ${signal}`);
            finishShutdown({ signal, timeout, exitCode });
        });
        server.closeIdleConnections?.();
    }

    processRef.once("SIGTERM", () => shutdown("SIGTERM"));
    processRef.once("SIGINT", () => shutdown("SIGINT"));
    processRef.once("uncaughtException", (err) => {
        logSafeError("UNCAUGHT_EXCEPTION", err, {
            logger,
            component: "shutdown",
        });
        shutdown("uncaughtException", 1);
    });
    processRef.once("unhandledRejection", (reason) => {
        logSafeError("UNHANDLED_REJECTION", reason, {
            logger,
            component: "shutdown",
        });
        shutdown("unhandledRejection", 1);
    });

    return shutdown;
}
