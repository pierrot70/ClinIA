import { describe, expect, it, vi } from "vitest";

import { registerGracefulShutdown } from "../gracefulShutdown.js";

function makeHarness({ closeError = null, disconnectError = null } = {}) {
    const signalHandlers = {};
    const processRef = {
        once: vi.fn((signal, handler) => {
            signalHandlers[signal] = handler;
        }),
        exit: vi.fn(),
    };
    const server = {
        close: vi.fn((callback) => callback(closeError)),
        closeIdleConnections: vi.fn(),
    };
    const mongoose = {
        disconnect: disconnectError
            ? vi.fn().mockRejectedValue(disconnectError)
            : vi.fn().mockResolvedValue(undefined),
    };
    const logger = {
        log: vi.fn(),
        error: vi.fn(),
    };
    const timeout = { unref: vi.fn() };
    const setTimeoutFn = vi.fn(() => timeout);
    const clearTimeoutFn = vi.fn();

    registerGracefulShutdown({
        server,
        mongoose,
        logger,
        processRef,
        setTimeoutFn,
        clearTimeoutFn,
    });

    return {
        clearTimeoutFn,
        logger,
        mongoose,
        processRef,
        server,
        setTimeoutFn,
        signalHandlers,
        timeout,
    };
}

describe("graceful shutdown", () => {
    it("drains HTTP, disconnects Mongo, and exits cleanly on SIGTERM", async () => {
        const harness = makeHarness();

        harness.signalHandlers.SIGTERM();
        await vi.waitFor(() => {
            expect(harness.processRef.exit).toHaveBeenCalledWith(0);
        });

        expect(harness.server.close).toHaveBeenCalledTimes(1);
        expect(harness.server.closeIdleConnections).toHaveBeenCalledTimes(1);
        expect(harness.mongoose.disconnect).toHaveBeenCalledTimes(1);
        expect(harness.clearTimeoutFn).toHaveBeenCalledWith(harness.timeout);
    });

    it("registers shutdown signals and fatal process errors", () => {
        const harness = makeHarness();

        expect(harness.processRef.once).toHaveBeenCalledWith(
            "SIGTERM",
            expect.any(Function)
        );
        expect(harness.processRef.once).toHaveBeenCalledWith(
            "SIGINT",
            expect.any(Function)
        );
        expect(harness.processRef.once).toHaveBeenCalledWith(
            "uncaughtException",
            expect.any(Function)
        );
        expect(harness.processRef.once).toHaveBeenCalledWith(
            "unhandledRejection",
            expect.any(Function)
        );
    });

    it("ignores repeated shutdown signals", async () => {
        const harness = makeHarness();

        harness.signalHandlers.SIGTERM();
        harness.signalHandlers.SIGINT();
        await vi.waitFor(() => {
            expect(harness.processRef.exit).toHaveBeenCalled();
        });

        expect(harness.server.close).toHaveBeenCalledTimes(1);
        expect(harness.mongoose.disconnect).toHaveBeenCalledTimes(1);
    });

    it("exits with failure when Mongo disconnect fails", async () => {
        const harness = makeHarness({
            disconnectError: new Error("mongo disconnect failed"),
        });

        harness.signalHandlers.SIGTERM();
        await vi.waitFor(() => {
            expect(harness.processRef.exit).toHaveBeenCalledWith(1);
        });
    });

    it("exits with failure when HTTP close fails", async () => {
        const harness = makeHarness({
            closeError: new Error("http close failed"),
        });

        harness.signalHandlers.SIGTERM();
        await vi.waitFor(() => {
            expect(harness.processRef.exit).toHaveBeenCalledWith(1);
        });
    });

    it("shuts down with failure after an uncaught exception", async () => {
        const harness = makeHarness();
        const error = new Error("fatal exception");

        harness.signalHandlers.uncaughtException(error);
        await vi.waitFor(() => {
            expect(harness.processRef.exit).toHaveBeenCalledWith(1);
        });

        expect(harness.logger.error).toHaveBeenCalledWith(
            "CLINIA_SAFE_ERROR",
            {
                event: "UNCAUGHT_EXCEPTION",
                name: "Error",
                code: null,
                component: "shutdown",
            }
        );
        expect(harness.mongoose.disconnect).toHaveBeenCalledTimes(1);
    });

    it("shuts down with failure after an unhandled rejection", async () => {
        const harness = makeHarness();
        const reason = new Error("fatal rejection");

        harness.signalHandlers.unhandledRejection(reason);
        await vi.waitFor(() => {
            expect(harness.processRef.exit).toHaveBeenCalledWith(1);
        });

        expect(harness.logger.error).toHaveBeenCalledWith(
            "CLINIA_SAFE_ERROR",
            {
                event: "UNHANDLED_REJECTION",
                name: "Error",
                code: null,
                component: "shutdown",
            }
        );
        expect(harness.mongoose.disconnect).toHaveBeenCalledTimes(1);
    });

    it("forces exit when the graceful timeout expires", () => {
        const processRef = {
            once: vi.fn(),
            exit: vi.fn(),
        };
        const server = {
            close: vi.fn(),
        };
        const timeout = { unref: vi.fn() };
        let timeoutHandler;

        const shutdown = registerGracefulShutdown({
            server,
            mongoose: { disconnect: vi.fn() },
            processRef,
            setTimeoutFn: vi.fn((handler) => {
                timeoutHandler = handler;
                return timeout;
            }),
            clearTimeoutFn: vi.fn(),
        });

        shutdown("SIGTERM");
        timeoutHandler();

        expect(processRef.exit).toHaveBeenCalledWith(1);
    });
});
