import { describe, expect, it, vi } from "vitest";

import { createStartServer } from "../startServer.js";

describe("startServer", () => {
    it("connects to mongo, warms caches, initializes shutdown state, and listens", async () => {
        const connect = vi.fn().mockResolvedValue({});
        const mongoose = { connect };
        const initShutdownState = vi.fn().mockResolvedValue(undefined);
        const logger = {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const listen = vi.fn((port, callback) => callback());
        const app = { listen };
        const warmTranslationMemoryCache = vi.fn().mockResolvedValue(undefined);

        const startServer = createStartServer({
            mongoose,
            initShutdownState,
            logger,
            port: 4010,
            mongoUri: "mongodb://example/clinia",
            mockAi: "1",
            openaiModel: "gpt-4.1-mini",
        });

        await startServer({ app, warmTranslationMemoryCache });

        expect(connect).toHaveBeenCalledWith("mongodb://example/clinia", {
            serverSelectionTimeoutMS: 2000,
        });
        expect(warmTranslationMemoryCache).toHaveBeenCalledTimes(1);
        expect(initShutdownState).toHaveBeenCalledTimes(1);
        expect(listen).toHaveBeenCalledWith(4010, expect.any(Function));
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("logs a fail-fast mongo connection error without starting the server", async () => {
        const connect = vi.fn().mockRejectedValue(new Error("mongo down"));
        const mongoose = { connect };
        const initShutdownState = vi.fn();
        const logger = {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const listen = vi.fn();
        const app = { listen };
        const warmTranslationMemoryCache = vi.fn();

        const startServer = createStartServer({
            mongoose,
            initShutdownState,
            logger,
            port: 4010,
            mongoUri: "mongodb://example/clinia",
        });

        await startServer({ app, warmTranslationMemoryCache });

        expect(listen).not.toHaveBeenCalled();
        expect(warmTranslationMemoryCache).not.toHaveBeenCalled();
        expect(initShutdownState).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            "❌ Mongo connection error (FAIL-FAST):",
            "mongo down"
        );
    });

    it("refuses a root Mongo account in production", async () => {
        const connect = vi.fn();
        const mongoose = { connect };
        const initShutdownState = vi.fn();
        const logger = {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const listen = vi.fn();
        const app = { listen };
        const warmTranslationMemoryCache = vi.fn();

        const startServer = createStartServer({
            mongoose,
            initShutdownState,
            logger,
            mongoUri: "mongodb://root:secret@mongo:27017/clinia?authSource=admin",
            nodeEnv: "production",
        });

        await startServer({ app, warmTranslationMemoryCache });

        expect(connect).not.toHaveBeenCalled();
        expect(listen).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            "❌ Mongo connection error (FAIL-FAST):",
            "Production MONGO_URI must use a dedicated non-root application user."
        );
    });
});
