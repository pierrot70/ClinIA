import { Appointment } from "../models/Appointment.js";
import { Specialist } from "../models/Specialist.js";
import { URGENTOLOGIST_DAILY_LIMIT } from "../domain/specialties.js";

// Count consultations, not distinct patients. No clinic filter: a physician
// cannot double their daily capacity by working at two clinics.
export async function countUrgentologistConsultations(specialist, date, { session = null, excludeAppointmentId = null } = {}) {
    const query = { specialist, date, status: { $in: ["scheduled", "completed"] } };
    if (excludeAppointmentId) query._id = { $ne: excludeAppointmentId };
    return Appointment.countDocuments(query).session(session);
}

export async function reserveUrgentologistCapacity(specialist, date, { session, excludeAppointmentId = null } = {}) {
    if (!session) throw { code: "FORBIDDEN", message: "Transactional booking required." };
    // Every urgentologist booking/move locks the same physician before counting.
    // Competing transactions retry against the newly committed appointments.
    const lock = await Specialist.updateOne({ _id: specialist }, { $inc: { __v: 1 } }, { session });
    if (lock.modifiedCount !== 1) throw { code: "INVALID_INPUT", message: "Médecin introuvable." };
    const count = await countUrgentologistConsultations(specialist, date, { session, excludeAppointmentId });
    if (count >= URGENTOLOGIST_DAILY_LIMIT) {
        throw { code: "MAXIMUM_APPOINTMENTS_REACHED", message: `Limite quotidienne atteinte pour cet urgentologue (${URGENTOLOGIST_DAILY_LIMIT}).` };
    }
}
