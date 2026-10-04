import {defineConfig} from "vitest/config";
export default defineConfig({test: {
    include: ["integration/loginThrottle.integration.js"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
}});
