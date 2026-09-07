export const URGENTOLOGIST_SPECIALTY = "Urgentologue";
// Temporary UI-test switch. Production and the normal automated scenarios
// keep the business limit of 20, even if this variable leaks into deployment.
export function resolveUrgentologistDailyLimit(env = process.env) {
    return env.NODE_ENV === "development" && env.CLINIA_TEST_URGENTOLOGIST_LIMIT === "1" ? 1 : 20;
}
export const URGENTOLOGIST_DAILY_LIMIT = resolveUrgentologistDailyLimit();
export const isUrgentologist = value => typeof value === "string" && value.trim().toLowerCase() === "urgentologue";

export function assertUrgentologistAvailability(specialist) {
    if (!isUrgentologist(specialist.specialite)) return;
    if ((specialist.disponibilites || []).length ||
        (specialist.practiceLocations || []).some(location => (location.disponibilites || []).length)) {
        throw { code: "INVALID_INPUT", message: "Un urgentologue accepte uniquement des créneaux walk-in. Retirez les disponibilités régulières avant de changer sa spécialité." };
    }
}
