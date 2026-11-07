import mongoose from "mongoose";
import { AdminUser } from "../models/AdminUser.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";

const objectId = value => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value) && mongoose.Types.ObjectId.isValid(value);
const denied = res => res.status(403).json({ error: { code: "FORBIDDEN", message: "Accès IPS limité aux dossiers et rendez-vous autorisés.", retryable: false } });

// Adding a clinical role is not an alias for every physician permission.
// This extra guard limits IPS callers to explicit actions and their own scope.
export function requireIpsClinicalScope(resource) {
    return async function ipsScope(req, res, next) {
        if (req.auth?.role !== "IPS") return next();
        try {
            const userId = req.auth.userId;
            if (!objectId(userId)) return denied(res);
            const active = await AdminUser.findOne({ _id: userId, role: "IPS", isActive: true }, { _id: 1 }).lean();
            if (!active) return denied(res);
            const professionals = await Specialist.find({ accountUserId: userId, specialite: "IPS" }, { _id: 1 }).lean();
            if (!professionals.length) return denied(res);
            const ownSpecialists = new Set(professionals.map(p => String(p._id)));
            const method = req.method;
            const path = req.path || "/";
            const ownPatient = async id => objectId(id) && !!await Patient.exists({ _id: id, ownerUserId: userId, archivedAt: null });
            if (resource === "patients") {
                if ((path === "/" || path === "") && ["GET", "POST"].includes(method)) {
                    if (req.body?.ownerUserId !== undefined || req.body?.receivingPhysicianUserId !== undefined) return denied(res);
                    if (method === "GET" && req.query?.archiveStatus === "archived") return denied(res);
                    // List/create services use buildOwnerScope, which always
                    // returns ownerUserId:userId for IPS (never an empty scope).
                    return next();
                }
                const match = path.match(/^\/([a-f0-9]{24})(?:\/(secure-request-documents|clinical-note-versions))?\/?$/i);
                if (!match || !(["GET", "PATCH"].includes(method)) || (match[2] && method !== "GET")) return denied(res);
                if (!await ownPatient(match[1])) return denied(res);
                if (req.body?.ownerUserId !== undefined) return denied(res);
                return next();
            }
            if (resource === "appointments") {
                if (method === "GET" && (path === "/" || path === "")) {
                    req.ipsAppointmentSpecialistIds = ownSpecialists;
                    return next();
                }
                if (method === "GET" && ["/manual-options", "/slots"].includes(path)) {
                    const patientId = req.query?.patient ?? req.query?.patientId;
                    if (patientId && !await ownPatient(patientId)) return denied(res);
                    if (req.query?.specialist && !ownSpecialists.has(String(req.query.specialist))) return denied(res);
                    return next();
                }
                if (method === "POST" && (path === "/" || path === "")) {
                    if (!ownSpecialists.has(String(req.body?.specialist)) || !await ownPatient(req.body?.patient)) return denied(res);
                    if (req.body?.ownerUserId !== undefined || req.body?.receivingPhysicianUserId !== undefined) return denied(res);
                    return next();
                }
                const match = path.match(/^\/([a-f0-9]{24})(?:\/(status|reschedule|schedule))?\/?$/i);
                if (!match) return denied(res);
                const permitted = match[2] === "status" || match[2] === "schedule" ? method === "PATCH"
                    : match[2] === "reschedule" ? method === "POST" : ["GET", "DELETE"].includes(method);
                if (!permitted) return denied(res);
                const appointment = await Appointment.exists({ _id: match[1], ownerUserId: userId, specialist: { $in: [...ownSpecialists] } });
                if (!appointment) return denied(res);
                return next();
            }
            if (resource === "consultations") {
                // The consultation service independently checks the exact active
                // account, its IPS directory link and the assigned encounter.
                const allowed = method === "GET" && (path === "/" || /^\/[a-f0-9]{24}\/?$/i.test(path))
                    || method === "POST" && /^\/[a-f0-9]{24}\/(notes|accept-care)\/?$/i.test(path);
                return allowed ? next() : denied(res);
            }
            if (resource === "directory") return method === "GET" ? next() : denied(res);
            if (resource === "clinicalTerms") return (method === "GET" && path === "/approved") || (method === "POST" && path === "/requests") ? next() : denied(res);
            return denied(res);
        } catch {
            return res.status(503).json({ error: { code: "CLINICAL_ACCESS_UNAVAILABLE", message: "Vérification des accès cliniques indisponible.", retryable: true } });
        }
    };
}
