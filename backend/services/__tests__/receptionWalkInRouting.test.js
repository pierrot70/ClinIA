import { describe, expect, it } from "vitest";
import { clinicDistanceKm, hasClinicCoordinates, orderedWalkInClinics, WALK_IN_RADIUS_KM, WALK_IN_TOLERANCE_KM, WALK_IN_MAX_DISTANCE_KM, isWithinWalkInDistance } from "../receptionWalkInRouting.js";

describe("clinic-only WalkIn distance bounds", () => {
    const origin = { _id: "origin", nom: "Origin", lat: 0, long: 0 };
    it.each([null, undefined, "", "0", NaN, Infinity, 91, -91])("refuses nonnumeric or out-of-range latitude %s", lat => {
        expect(hasClinicCoordinates({ lat, long: 0 })).toBe(false);
        expect(clinicDistanceKm(origin, { lat, long: 0 })).toBeNull();
    });
    it.each([null, "", "0", NaN, Infinity, 181, -181])("refuses invalid longitude %s", long => {
        expect(hasClinicCoordinates({ lat: 0, long })).toBe(false);
    });
    it("accepts zero coordinates, antipodes and antimeridian without NaN", () => {
        expect(hasClinicCoordinates(origin)).toBe(true);
        expect(clinicDistanceKm(origin, origin)).toBe(0);
        expect(clinicDistanceKm(origin, { lat: 0, long: 180 })).toBeCloseTo(Math.PI * 6371, 6);
        expect(clinicDistanceKm({ lat: 0, long: 179.9 }, { lat: 0, long: -179.9 })).toBeLessThan(23);
    });
    it("enforces the unrounded effective 110km maximum and searches each neighbor once by distance", () => {
        const longitudeForKm = distance => distance / 6371 * 180 / Math.PI;
        const inside = { _id: "inside", nom: "Inside", lat: 0, long: longitudeForKm(109.9999) };
        const outside = { _id: "outside", nom: "Outside", lat: 0, long: longitudeForKm(110.0001) };
        const near = { _id: "near", nom: "Near", lat: 0, long: longitudeForKm(10) };
        const result = orderedWalkInClinics(origin, [outside, inside, origin, near]);
        expect(WALK_IN_RADIUS_KM).toBe(100);
        expect(WALK_IN_TOLERANCE_KM).toBe(10);
        expect(WALK_IN_MAX_DISTANCE_KM).toBe(110);
        expect(result.candidates.map(row => row.clinic._id)).toEqual(["origin", "near", "inside"]);
        expect(result.candidates.at(-1).distanceKm).toBeLessThan(110);
        expect(result.hasUnlocatedClinics).toBe(false);
    });
    it("retains only origin when it cannot be located and identifies unlocated neighbors", () => {
        const result = orderedWalkInClinics({ ...origin, lat: null }, [{ _id: "missing" }, { _id: "valid", lat: 0, long: 0.1 }]);
        expect(result.candidates.map(row => row.clinic._id)).toEqual(["origin"]);
        expect(result.originLocated).toBe(false);
        expect(result.hasUnlocatedClinics).toBe(true);
    });
    it.each([[100, true], [105, true], [110, true], [110.001, false], [110.000001, false], [null, false], [NaN, false]])("applies the inclusive effective distance limit without rounding (%s)", (distance, expected) => {
        expect(isWithinWalkInDistance(distance)).toBe(expected);
    });

});
