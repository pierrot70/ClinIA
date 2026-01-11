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
        patientInsuranceNumber: body.patientInsuranceNumber,
        specialist: body.specialist,
        date: body.date,
        time: body.time,
        reason: typeof body.reason === "string" ? body.reason : "",
    };
}
