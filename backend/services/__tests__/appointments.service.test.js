import { beforeEach, describe, expect, it, vi } from "vitest";

const findOne = vi.fn();

vi.mock("../../models/Appointment.js", () => ({
    Appointment: {
        findOne,
    },
}));

const {
    cancelAppointment,
    updateAppointmentSchedule,
    updateAppointmentStatus,
} = await import("../appointments.js");

function buildAppointment(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439011",
        specialist: "cardiology",
        date: "2099-01-01",
        time: "10:00",
        status: "scheduled",
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("appointments service", () => {
    const authUser = {
        userId: "507f1f77bcf86cd799439099",
        role: "MEDECIN",
    };

    it("annule un rendez-vous", async () => {
        const appointment = buildAppointment();
        findOne.mockResolvedValue(appointment);

        const result = await cancelAppointment(appointment._id, authUser);

        expect(findOne).toHaveBeenCalledWith({
            _id: appointment._id,
            ownerUserId: authUser.userId,
        });
        expect(result.status).toBe("cancelled");
        expect(appointment.save).toHaveBeenCalledTimes(1);
    });

    it("marque un rendez-vous comme completed", async () => {
        const appointment = buildAppointment({ status: "scheduled" });
        findOne.mockResolvedValue(appointment);

        const result = await updateAppointmentStatus(
            appointment._id,
            "completed",
            authUser
        );

        expect(result.status).toBe("completed");
        expect(appointment.save).toHaveBeenCalledTimes(1);
    });

    it("modifie l'horaire d'un rendez-vous", async () => {
        const appointment = buildAppointment({
            date: "2099-01-01",
            time: "10:00",
        });
        findOne.mockResolvedValueOnce(appointment).mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue(null),
        });

        const result = await updateAppointmentSchedule(
            appointment._id,
            {
                date: "2099-01-02",
                time: "11:15",
            },
            authUser
        );

        expect(result.date).toBe("2099-01-02");
        expect(result.time).toBe("11:15");
        expect(appointment.save).toHaveBeenCalledTimes(1);
    });

    it("allows admins to access appointments without an owner filter", async () => {
        const appointment = buildAppointment();
        findOne.mockResolvedValue(appointment);

        await cancelAppointment(appointment._id, {
            userId: authUser.userId,
            role: "ADMIN",
        });

        expect(findOne).toHaveBeenCalledWith({
            _id: appointment._id,
        });
    });
});
