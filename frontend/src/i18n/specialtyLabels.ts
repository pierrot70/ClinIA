import { SPECIALTIES } from "../data/specialties";
import { appointmentSpecialtyLabel } from "./appointmentSpecialtyLabels";

function specialtyKey(value: string) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

const canonicalSpecialties = new Map(SPECIALTIES.map(value => [specialtyKey(value), value]));

// Shared display catalogue for specialty names. Never change stored values,
// matching logic or the English-only treatment descriptions.
export function displaySpecialty(value: string, locale: string): string {
    const canonical = canonicalSpecialties.get(specialtyKey(value));
    return canonical ? appointmentSpecialtyLabel(canonical, locale) : value.trim();
}
