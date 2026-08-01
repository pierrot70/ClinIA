import { describe, expect, it } from "vitest";
import { calculateDistanceKm, sortByDistance } from "./geography";

describe("geography", () => {
    it("calculates a distance locally from valid coordinates", () => {
        expect(calculateDistanceKm(
            { lat: 45.5, long: -73.5 },
            { lat: 45.5, long: -73.5 }
        )).toBe(0);
        expect(calculateDistanceKm(
            { lat: 45.5, long: -73.5 },
            { lat: null, long: -73.5 }
        )).toBeNull();
    });

    it("places the nearest clinics first and clinics without coordinates last", () => {
        const clinics = sortByDistance(
            { lat: 45.5, long: -73.5 },
            [
                { nom: "Sans coordonnées" },
                { nom: "Lointaine", lat: 45.7, long: -73.5 },
                { nom: "Proche", lat: 45.51, long: -73.5 },
            ]
        );

        expect(clinics.map((clinic) => clinic.nom)).toEqual([
            "Proche",
            "Lointaine",
            "Sans coordonnées",
        ]);
    });
});
