import { beforeEach, describe, expect, it, vi } from "vitest";

const findMock = vi.fn();
const createMock = vi.fn();
const countDocumentsMock = vi.fn();
const distinctMock = vi.fn();

vi.mock("../../models/ClinicianComment.js", () => ({
    ClinicianComment: {
        find: findMock,
        create: createMock,
        countDocuments: countDocumentsMock,
        distinct: distinctMock,
    },
}));

describe("clinicianComments service", () => {
    beforeEach(() => {
        findMock.mockReset();
        createMock.mockReset();
        countDocumentsMock.mockReset();
        distinctMock.mockReset();
    });

    it("returns a neutral responder label for public reply lookups", async () => {
        const leanMock = vi.fn().mockResolvedValue([
            {
                _id: "661111111111111111111111",
                actorUserId: null,
                actorUsername: "dr lasante",
                actorRole: "ANONYMOUS",
                comment: "Commentaire test",
                redactionCount: 0,
                redactionTypes: [],
                createdAt: "2026-04-19T13:00:00.000Z",
                replies: [
                    {
                        _id: "662222222222222222222222",
                        responderUserId: "663333333333333333333333",
                        responderUsername: "pierre.lasante@videotron.ca",
                        responderRole: "ADMIN",
                        message: "Ceci est une reponse",
                        createdAt: "2026-04-19T13:05:00.000Z",
                    },
                ],
            },
        ]);
        const sortMock = vi.fn(() => ({ lean: leanMock }));
        findMock.mockReturnValue({ sort: sortMock });

        const { lookupClinicianReplies } = await import("../clinicianComments.js");

        const result = await lookupClinicianReplies({
            actorUsername: "Dr Lasante",
            trackingCode: "TY677EJK",
        });

        expect(findMock).toHaveBeenCalled();
        expect(result.items[0].replies[0].responderUsername).toBe("Equipe ClinIA");
        expect(result.items[0].replies[0].message).toBe("Ceci est une reponse");
    });

    it("rejects an invalid clinician comment category", async () => {
        const { createClinicianComment } = await import("../clinicianComments.js");

        await expect(
            createClinicianComment({
                authUser: null,
                comment: "Commentaire valide",
                guestDisplayName: "dr lasante",
                trackingCode: "TY677EJK",
                category: "AUTRE",
            })
        ).rejects.toMatchObject({
            code: "INVALID_INPUT",
            message: "Le type de commentaire est invalide.",
        });

        expect(createMock).not.toHaveBeenCalled();
    });

    it("filters admin comment listing by category", async () => {
        const leanMock = vi.fn().mockResolvedValue([]);
        const limitMock = vi.fn(() => ({ lean: leanMock }));
        const skipMock = vi.fn(() => ({ limit: limitMock }));
        const sortMock = vi.fn(() => ({ skip: skipMock }));
        findMock.mockReturnValue({ sort: sortMock });
        countDocumentsMock.mockResolvedValue(0);
        distinctMock.mockResolvedValue([]);

        const { listClinicianComments } = await import("../clinicianComments.js");

        await listClinicianComments({
            authUser: { userId: "664444444444444444444444", role: "ADMIN" },
            scope: "all",
            category: "urgent",
        });

        expect(findMock).toHaveBeenCalledWith({ category: "URGENT" });
        expect(countDocumentsMock).toHaveBeenCalledWith({ category: "URGENT" });
        expect(distinctMock).toHaveBeenCalledWith("actorUsername", {
            category: "URGENT",
        });
    });
});
