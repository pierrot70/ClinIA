import { defineConfig } from "vitest/config";

export default defineConfig({ test: {
    include: ["integration/walkinScenarios.integration.js"],
    fileParallelism: false,
    bail: 1,
    hookTimeout: 30000,
    testTimeout: 30000,
} });
