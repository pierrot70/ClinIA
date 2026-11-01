import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["integration/ipsConsultations.integration.js"],fileParallelism:false,testTimeout:120000,hookTimeout:60000}});
