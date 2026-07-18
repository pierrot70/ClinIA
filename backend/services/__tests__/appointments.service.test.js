import { beforeEach, describe, expect, it, vi } from "vitest";

const findOne = vi.fn();
const patientFindOne = vi.fn();
const specialistFindById = vi.fn();
const cliniqueExists = vi.fn();

vi.mock("../../models/Appointment.js", () => ({
    Appointment: {
        findOne,
    },
}));

vi.mock("../../models/Patient.js", () => ({
    Patient: { findOne: patientFindOne },
}));

vi.mock("../../models/Specialist.js", () => ({
    Specialist: { findById: specialistFindById },
}));

vi.mock("../../models/Clinique.js", () => ({
    Clinique: { exists: cliniqueExists },
}));

const {
    cancelAppointment,
    createAppointment,
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

    it("rejects a specialist assigned to another clinic", async () => {
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                num_assurance_maladie: "RAMQ1234567890",
                ownerUserId: authUser.userId,
            }),
        });
        specialistFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                clinique_associer: "507f1f77bcf86cd799439022",
            }),
        });
        cliniqueExists.mockResolvedValue(true);

        await expect(
            createAppointment(
                {
                    patient: "507f1f77bcf86cd799439012",
                    specialist: "507f1f77bcf86cd799439021",
                    clinique: "507f1f77bcf86cd799439023",
                    date: "2099-01-01",
                    time: "10:00",
                    priority: "normal",
                },
                authUser
            )
        ).rejects.toEqual({
            code: "INVALID_INPUT",
            message:
                "Le spécialiste sélectionné n'est pas associé à cette clinique.",
        });
    });

    it("rejects an appointment for an archived patient", async () => {
        patientFindOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                archivedAt: new Date(),
            }),
        });

        await expect(
            createAppointment(
                {
                    patient: "507f1f77bcf86cd799439012",
                    specialist: "507f1f77bcf86cd799439021",
                    date: "2099-01-01",
                    time: "10:00",
                    priority: "normal",
                },
                authUser
            )
        ).rejects.toEqual({
            code: "PATIENT_ARCHIVED",
            message: "Ce dossier patient est archivé. Aucun rendez-vous ne peut y être ajouté.",
        });
    });
});
