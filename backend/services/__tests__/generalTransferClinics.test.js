import { describe, expect, it } from "vitest";
import { nextGeneralClinic } from "../generalTransferClinics.js";

const clinic = (_id, nom, lat, long) => ({ _id, nom, lat, long });
const origin = clinic("origin", "Origine", 45, -73);
const first = clinic("first", "A", 45.1, -73);
const second = clinic("second", "B", 45.1, -73);
const clinicWithoutPhysician = clinic("empty", "C", 45.01, -73);
const directory = {
    clinics: [second, clinicWithoutPhysician, origin, first],
    candidates: new Set(["first", "second"]),
};
const transfer = (...ids) => ({ contactedClinics: ids.map(clinicId => ({ clinicId })) });

describe("next clinic for a general transfer", () => {
    it("breaks equal distances consistently and skips clinics already contacted or without a family physician", () => {
        expect(nextGeneralClinic(transfer("origin"), directory)).toEqual({ _id: first._id, nom: first.nom });
        expect(nextGeneralClinic(transfer("origin", "first"), directory)).toEqual({ _id: second._id, nom: second.nom });
        expect(nextGeneralClinic(transfer("origin", "first", "second"), directory)).toBeNull();
    });
    it("offers no geographic extension if either end cannot be located", () => {
        expect(nextGeneralClinic(transfer("missing"), directory)).toBeNull();
        const unlocated = { ...origin, lat: undefined };
        expect(nextGeneralClinic(transfer("origin"), { ...directory, clinics: [unlocated, first] })).toBeNull();
        expect(nextGeneralClinic(transfer("origin"), { ...directory, clinics: [origin, { ...first, long: undefined }] })).toBeNull();
    });
});
