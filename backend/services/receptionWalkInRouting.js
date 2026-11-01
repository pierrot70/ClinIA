import { IPS_SPECIALTY, URGENTOLOGIST_SPECIALTY } from "../domain/specialties.js";

// Distance uses clinic directory coordinates only; no patient location,
// browser geolocation or external geocoding service is involved.
export const WALK_IN_RADIUS_KM = 100;
export const WALK_IN_TOLERANCE_KM = 10;
export const WALK_IN_MAX_DISTANCE_KM = WALK_IN_RADIUS_KM + WALK_IN_TOLERANCE_KM;

export function isWithinWalkInDistance(distanceKm) {
    return typeof distanceKm === "number" && Number.isFinite(distanceKm) && distanceKm >= 0 && distanceKm <= WALK_IN_MAX_DISTANCE_KM;
}
export const WALK_IN_SPECIALTY_PRIORITY = [URGENTOLOGIST_SPECIALTY, IPS_SPECIALTY, "Medecin de famille"];

export function hasClinicCoordinates(clinic) {
    return typeof clinic?.lat === "number" && Number.isFinite(clinic.lat) && Math.abs(clinic.lat) <= 90
        && typeof clinic?.long === "number" && Number.isFinite(clinic.long) && Math.abs(clinic.long) <= 180;
}

export function clinicDistanceKm(origin, destination) {
    if (!hasClinicCoordinates(origin) || !hasClinicCoordinates(destination)) return null;
    const radians = value => value * Math.PI / 180;
    const dLat = radians(destination.lat - origin.lat);
    const dLong = radians(destination.long - origin.long);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(origin.lat)) * Math.cos(radians(destination.lat)) * Math.sin(dLong / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

export function orderedWalkInClinics(origin, clinics) {
    const others = clinics.filter(clinic => String(clinic._id) !== String(origin._id));
    const hasUnlocatedClinics = others.some(clinic => !hasClinicCoordinates(clinic));
    const originLocated = hasClinicCoordinates(origin);
    const candidates = originLocated ? others.flatMap(clinic => {
        const distanceKm = clinicDistanceKm(origin, clinic);
        // Never round before enforcing the maximum radius.
        return isWithinWalkInDistance(distanceKm) ? [{ clinic, distanceKm }] : [];
    }).sort((left, right) => left.distanceKm - right.distanceKm
        || String(left.clinic.nom || "").localeCompare(String(right.clinic.nom || ""), "fr")
        || String(left.clinic._id).localeCompare(String(right.clinic._id))) : [];
    return { candidates: [{ clinic: origin, distanceKm: 0 }, ...candidates], originLocated, hasUnlocatedClinics };
}
