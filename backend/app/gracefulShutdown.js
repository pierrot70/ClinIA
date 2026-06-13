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
            logger.error("[shutdown] MongoDB disconnect failed:", err?.message);
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
            logger.error(
                `[shutdown] Graceful shutdown exceeded ${timeoutMs}ms`
            );
            processRef.exit(1);
        }, timeoutMs);
        timeout?.unref?.();

        server.close((err) => {
            if (err) {
                logger.error("[shutdown] HTTP server close failed:", err.message);
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
        logger.error("[fatal] uncaughtException:", err);
        shutdown("uncaughtException", 1);
    });
    processRef.once("unhandledRejection", (reason) => {
        logger.error("[fatal] unhandledRejection:", reason);
        shutdown("unhandledRejection", 1);
    });

    return shutdown;
}
