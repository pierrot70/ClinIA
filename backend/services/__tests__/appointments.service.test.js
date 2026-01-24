import { beforeEach, describe, expect, it, vi } from "vitest";

const findById = vi.fn();
const findOne = vi.fn();

vi.mock("../../models/Appointment.js", () => ({
    Appointment: {
        findById,
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
    it("annule un rendez-vous", async () => {
        const appointment = buildAppointment();
        findById.mockResolvedValue(appointment);

        const result = await cancelAppointment(appointment._id);

        expect(result.status).toBe("cancelled");
        expect(appointment.save).toHaveBeenCalledTimes(1);
    });

    it("marque un rendez-vous comme completed", async () => {
        const appointment = buildAppointment({ status: "scheduled" });
        findById.mockResolvedValue(appointment);

        const result = await updateAppointmentStatus(
            appointment._id,
            "completed"
        );

        expect(result.status).toBe("completed");
        expect(appointment.save).toHaveBeenCalledTimes(1);
    });

    it("modifie l'horaire d'un rendez-vous", async () => {
        const appointment = buildAppointment({
            date: "2099-01-01",
            time: "10:00",
        });
        findById.mockResolvedValue(appointment);
        findOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
        });

        const result = await updateAppointmentSchedule(appointment._id, {
            date: "2099-01-02",
            time: "11:15",
        });

        expect(result.date).toBe("2099-01-02");
        expect(result.time).toBe("11:15");
        expect(appointment.save).toHaveBeenCalledTimes(1);
    });
});
