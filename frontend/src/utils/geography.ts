export type GeographicCoordinates = {
    lat?: number | null;
    long?: number | null;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

export function calculateDistanceKm(
    origin: GeographicCoordinates,
    destination: GeographicCoordinates
): number | null {
    if (
        !Number.isFinite(origin.lat) ||
        !Number.isFinite(origin.long) ||
        !Number.isFinite(destination.lat) ||
        !Number.isFinite(destination.long)
    ) {
        return null;
    }

    const latitudeDelta = toRadians(destination.lat - origin.lat);
    const longitudeDelta = toRadians(destination.long - origin.long);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(toRadians(origin.lat)) *
            Math.cos(toRadians(destination.lat)) *
            Math.sin(longitudeDelta / 2) ** 2;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function sortByDistance<T extends GeographicCoordinates & { nom: string }>(
    origin: GeographicCoordinates,
    locations: T[]
): T[] {
    return locations.slice().sort((left, right) => {
        const leftDistance = calculateDistanceKm(origin, left);
        const rightDistance = calculateDistanceKm(origin, right);

        if (leftDistance !== null && rightDistance !== null) {
            return leftDistance - rightDistance || left.nom.localeCompare(right.nom, "fr");
        }
        if (leftDistance !== null) return -1;
        if (rightDistance !== null) return 1;
        return left.nom.localeCompare(right.nom, "fr");
    });
}
