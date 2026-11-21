import { AdminUser } from "../models/AdminUser.js";
import { Clinique } from "../models/Clinique.js";
import { Specialist } from "../models/Specialist.js";
import { getPracticeLocations } from "./appointments.js";
import { orderedWalkInClinics } from "./receptionWalkInRouting.js";

export const FAMILY_SPECIALTIES = ["Medecin de famille", "Médecin de famille", "Medecine familiale", "Médecine familiale"];
const configuredLimit = Number(process.env.GENERAL_TRANSFER_MAX_CLINICS);
export const GENERAL_TRANSFER_MAX_CLINICS = Number.isSafeInteger(configuredLimit) && configuredLimit >= 1 ? configuredLimit : 2;

export function clinicIds(directory) {
    return getPracticeLocations(directory).map(location => location.clinique);
}

export function mayExtend(transfer, issuer) {
    const contacted = transfer.contactedClinics ?? [];
    return transfer.kind === "GENERAL" && transfer.status === "PENDING" &&
        contacted.length > 0 && contacted.length < GENERAL_TRANSFER_MAX_CLINICS &&
        clinicIds(issuer.directory).includes(String(contacted[0].clinicId));
}

// Read only practice locations and account eligibility. Opt-in is a direct-transfer preference.
export async function extensionDirectory(issuer, session = null) {
    const professionals = await Specialist.find({
        specialite: { $in: FAMILY_SPECIALTIES }, accountUserId: { $type: "objectId" },
    }, { accountUserId: 1, clinique_associer: 1, "practiceLocations.clinique": 1 }).session(session).lean();
    const activeAccounts = await AdminUser.distinct("_id", {
        _id: { $in: professionals.map(row => row.accountUserId) }, role: "MEDECIN", isActive: true,
    }).session(session);
    const active = new Set(activeAccounts.map(String));
    const candidates = new Set(professionals.filter(row => active.has(String(row.accountUserId))).flatMap(clinicIds));
    const clinics = await Clinique.find({ _id: { $in: [...candidates, ...clinicIds(issuer.directory)] } },
        { nom: 1, lat: 1, long: 1 }).session(session).lean();
    return { clinics, candidates };
}

export function nextGeneralClinic(transfer, directory) {
    const excluded = new Set(transfer.contactedClinics.map(entry => String(entry.clinicId)));
    const origin = directory.clinics.find(clinic => String(clinic._id) === String(transfer.contactedClinics[0].clinicId));
    if (!origin) return null;
    const candidates = directory.clinics.filter(clinic =>
        directory.candidates.has(String(clinic._id)) && !excluded.has(String(clinic._id)));
    const { candidates: ordered } = orderedWalkInClinics(origin, candidates, Infinity);
    const next = ordered[1]?.clinic;
    return next ? { _id: String(next._id), nom: next.nom } : null;
}
