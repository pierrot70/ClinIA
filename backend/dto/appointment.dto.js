/* ------------------------------------------------------------------ */
/* Appointment DTO                                                     */
/* ------------------------------------------------------------------ */

/**
 * Transforme un req.body brut en DTO contrôlé
 * - supprime les champs inconnus
 * - applique les defaults
 * - garantit une forme stable pour la couche service
 */
export function toCreateAppointmentDTO(body) {
    return {
        patient: body.patient?.trim(),
        specialist: body.specialist?.trim(),
        date: body.date,
        time: body.time,
        reason: body.reason ?? "",
        priority: body.priority === "urgent" ? "urgent" : "normal",
    };
}
