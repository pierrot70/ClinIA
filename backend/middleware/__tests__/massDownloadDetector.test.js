import { beforeEach, describe, expect, it, vi } from "vitest";

const createSecurityIncident = vi.fn().mockResolvedValue({ _id: "incident-1" });
const handleMassDownloadSignal = vi.fn().mockResolvedValue(false);
const findOneAndUpdate = vi.fn();
const updateOne = vi.fn();

vi.mock("../../services/securityIncidents.js", () => ({
    createSecurityIncident,
    handleMassDownloadSignal,
}));

vi.mock("../../models/MassDownloadWindow.js", () => ({
    MassDownloadWindow: {
        findOneAndUpdate,
        updateOne,
    },
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

        let totalCost = 0;
        findOneAndUpdate.mockImplementation(async () => {
            totalCost += 50;
            return {
                _id: "window-1",
                totalCost,
                incidentsCreated: 0,
            };
        });

        for (let i = 0; i < 4; i += 1) {
            await detector(req, {}, next);
        }

        expect(next).toHaveBeenCalledTimes(4);
        expect(createSecurityIncident).not.toHaveBeenCalled();
        expect(handleMassDownloadSignal).not.toHaveBeenCalled();
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

        let totalCost = 0;
        findOneAndUpdate.mockImplementation(async () => {
            totalCost += 50;
            return {
                _id: "window-2",
                totalCost,
                incidentsCreated: totalCost > 200 ? 1 : 0,
            };
        });
        updateOne.mockResolvedValue({ modifiedCount: 1 });

        for (let i = 0; i < 5; i += 1) {
            await detector(req, {}, next);
        }

        expect(next).toHaveBeenCalledTimes(5);
        expect(createSecurityIncident).toHaveBeenCalledTimes(1);
        expect(handleMassDownloadSignal).not.toHaveBeenCalled();
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
        expect(findOneAndUpdate).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                detectorKey: "patients_list",
                actorKey: "patients_list:user-2",
            }),
            expect.any(Object),
            expect.any(Object)
        );
    });

    it("aggregates authenticated requests by userId even when proxy IP changes", async () => {
        vi.spyOn(Date, "now").mockReturnValue(6_000);

        const detector = createPatientsMassDownloadDetector();
        const next = vi.fn();
        const firstReq = {
            method: "GET",
            path: "/",
            originalUrl: "/api/patients?page=1&limit=50",
            query: { page: "1", limit: "50" },
            headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
            ip: "127.0.0.1",
            auth: {
                userId: "user-shared",
                username: "superadmin@example.com",
                role: "SUPERADMIN",
            },
        };
        const secondReq = {
            ...firstReq,
            originalUrl: "/api/patients?page=2&limit=50",
            query: { page: "2", limit: "50" },
            headers: { "x-forwarded-for": "198.51.100.24, 10.0.0.2" },
        };

        let totalCost = 0;
        findOneAndUpdate.mockImplementation(async () => {
            totalCost += 50;
            return {
                _id: "window-shared",
                totalCost,
                incidentsCreated: 0,
            };
        });

        await detector(firstReq, {}, next);
        await detector(secondReq, {}, next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(findOneAndUpdate).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                actorKey: "patients_list:user-shared",
            }),
            expect.any(Object),
            expect.any(Object)
        );
        expect(findOneAndUpdate).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                actorKey: "patients_list:user-shared",
            }),
            expect.any(Object),
            expect.any(Object)
        );
        expect(createSecurityIncident).not.toHaveBeenCalled();
        expect(handleMassDownloadSignal).not.toHaveBeenCalled();
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

        let totalCost = 0;
        findOneAndUpdate.mockImplementation(async () => {
            totalCost += 1;
            return {
                _id: "window-3",
                totalCost,
                incidentsCreated: totalCost > 2 ? 1 : 0,
            };
        });
        updateOne.mockResolvedValue({ modifiedCount: 1 });

        await detector(req, {}, next);
        await detector(req, {}, next);
        await detector(req, {}, next);

        expect(next).toHaveBeenCalledTimes(3);
        expect(createSecurityIncident).toHaveBeenCalledTimes(1);
        expect(handleMassDownloadSignal).not.toHaveBeenCalled();
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
        expect(findOneAndUpdate).not.toHaveBeenCalled();
        expect(handleMassDownloadSignal).not.toHaveBeenCalled();
    });

    it("does not create a duplicate incident while cooldown update rejects the second write", async () => {
        vi.spyOn(Date, "now").mockReturnValue(30_000);

        const detector = createOpenAILogsExportMassDownloadDetector();
        const req = {
            method: "GET",
            path: "/export.csv",
            originalUrl: "/api/openai-logs/export.csv?startDate=2026-05-01",
            query: { startDate: "2026-05-01" },
            headers: {},
            ip: "127.0.0.9",
            auth: {
                userId: "user-9",
                username: "admin9@example.com",
                role: "ADMIN",
            },
        };
        const next = vi.fn();

        let totalCost = 0;
        findOneAndUpdate.mockImplementation(async () => {
            totalCost += 1;
            return {
                _id: "window-9",
                totalCost,
                incidentsCreated: totalCost > 2 ? 1 : 0,
            };
        });
        updateOne
            .mockResolvedValueOnce({ modifiedCount: 1 })
            .mockResolvedValueOnce({ modifiedCount: 0 });

        await detector(req, {}, next);
        await detector(req, {}, next);
        await detector(req, {}, next);
        await detector(req, {}, next);

        expect(createSecurityIncident).toHaveBeenCalledTimes(1);
        expect(handleMassDownloadSignal).toHaveBeenCalledTimes(1);
        expect(handleMassDownloadSignal).toHaveBeenCalledWith({
            userId: "user-9",
            detectedAt: expect.any(Date),
            additionalSignals: 1,
        });
    });

    it("waits for the silent escalation signal before continuing", async () => {
        vi.spyOn(Date, "now").mockReturnValue(40_000);

        const detector = createPatientsMassDownloadDetector();
        const req = {
            method: "GET",
            path: "/",
            originalUrl: "/api/patients?page=5&limit=50",
            query: { page: "5", limit: "50" },
            headers: {},
            ip: "127.0.0.1",
            auth: {
                userId: "user-10",
                username: "superadmin@example.com",
                role: "SUPERADMIN",
            },
        };
        const sequence = [];
        const next = vi.fn(() => {
            sequence.push("next");
        });

        let totalCost = 200;
        findOneAndUpdate.mockImplementation(async () => {
            totalCost += 50;
            return {
                _id: "window-10",
                totalCost,
                incidentsCreated: 1,
            };
        });
        updateOne.mockResolvedValue({ modifiedCount: 0 });
        handleMassDownloadSignal.mockImplementation(async () => {
            sequence.push("signal");
        });

        await detector(req, {}, next);

        expect(sequence).toEqual(["signal", "next"]);
    });
});
