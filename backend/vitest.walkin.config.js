import { defineConfig } from "vitest/config";
export default defineConfig({ test: {
    include: ["integration/urgentologistWalkIn.integration.js", "integration/receptionConcurrency.integration.js"],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 60000,
} });
