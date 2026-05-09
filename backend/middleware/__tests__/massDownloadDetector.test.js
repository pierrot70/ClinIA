import { beforeEach, describe, expect, it, vi } from "vitest";

const createSecurityIncident = vi.fn().mockResolvedValue({ _id: "incident-1" });

vi.mock("../../services/securityIncidents.js", () => ({
    createSecurityIncident,
}));

const {
    createMassDownloadDetector,
    createOpenAILogsExportMassDownloadDetector,
    createPatientsMassDownloadDetector,
    resetMassDownloadDetectorForTests,
} = await import("../massDownloadDetector.js");

describe("massDownloadDetector", () => {
    beforeEach(() => {
        resetMassDownloadDetectorForTests();
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it("does not create an incident while usage stays below threshold", async () => {
        vi.spyOn(Date, "now").mockReturnValue(1_000);

        const detector = createPatientsMassDownloadDetector();
        const req = {
            method: "GET",
            path: "/",
            originalUrl: "/api/patients?page=1&limit=50",
            query: { page: "1", limit: "50" },
            headers: {},
            ip: "127.0.0.1",
            auth: {
                userId: "user-1",
                username: "admin@example.com",
                role: "ADMIN",
            },
        };
        const next = vi.fn();

        for (let i = 0; i < 4; i += 1) {
            await detector(req, {}, next);
        }

        expect(next).toHaveBeenCalledTimes(4);
        expect(createSecurityIncident).not.toHaveBeenCalled();
    });

    it("creates one incident when repeated patient list requests exceed the threshold", async () => {
        vi.spyOn(Date, "now").mockReturnValue(5_000);

        const detector = createPatientsMassDownloadDetector();
        const req = {
            method: "GET",
            path: "/",
            originalUrl: "/api/patients?page=5&limit=50",
            query: { page: "5", limit: "50" },
            headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
            ip: "127.0.0.1",
            auth: {
                userId: "user-2",
                username: "superadmin@example.com",
                role: "SUPERADMIN",
            },
        };
        const next = vi.fn();

        for (let i = 0; i < 5; i += 1) {
            await detector(req, {}, next);
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(createSecurityIncident).toHaveBeenCalledTimes(1);
        expect(createSecurityIncident).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "MASS_DOWNLOAD_ATTEMPT",
                phase: "post_cloud",
                requestPath: "/api/patients?page=5&limit=50",
                context: expect.objectContaining({
                    detectorKey: "patients_list",
                    userId: "user-2",
                    username: "superadmin@example.com",
                    role: "SUPERADMIN",
                    ip: "203.0.113.10",
                    totalCost: 250,
                    threshold: 200,
                    requestedLimit: 50,
                    requestedPage: 5,
                }),
            })
        );
    });

    it("detects repeated OpenAI CSV exports and respects the export path", async () => {
        vi.spyOn(Date, "now").mockReturnValue(10_000);

        const detector = createOpenAILogsExportMassDownloadDetector();
        const req = {
            method: "GET",
            path: "/export.csv",
            originalUrl: "/api/openai-logs/export.csv?startDate=2026-05-01",
            query: { startDate: "2026-05-01" },
            headers: {},
            ip: "127.0.0.2",
            auth: {
                userId: "user-3",
                username: "admin2@example.com",
                role: "ADMIN",
            },
        };
        const next = vi.fn();

        await detector(req, {}, next);
        await detector(req, {}, next);
        await detector(req, {}, next);

        expect(next).toHaveBeenCalledTimes(3);
        expect(createSecurityIncident).toHaveBeenCalledTimes(1);
        expect(createSecurityIncident).toHaveBeenCalledWith(
            expect.objectContaining({
                context: expect.objectContaining({
                    detectorKey: "openai_logs_export",
                    exportType: "csv",
                    totalCost: 3,
                    threshold: 2,
                }),
            })
        );
    });

    it("supports a zero-cost event so non-target requests are ignored", async () => {
        vi.spyOn(Date, "now").mockReturnValue(20_000);

        const detector = createMassDownloadDetector({
            detectorKey: "test_detector",
            threshold: 1,
            computeCost: () => 0,
        });
        const req = {
            method: "POST",
            path: "/noop",
            originalUrl: "/noop",
            query: {},
            headers: {},
            ip: "127.0.0.1",
            auth: null,
        };
        const next = vi.fn();

        await detector(req, {}, next);
        await detector(req, {}, next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(createSecurityIncident).not.toHaveBeenCalled();
    });
});
