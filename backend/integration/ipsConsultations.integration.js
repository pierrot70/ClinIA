// Isolated permission proof: real JWT, guard, router, services and MongoDB.
// This harness does not mount or change production application routes.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import consultationsRouter from "../routes/consultations.js";
import patientsRouter from "../routes/patients.js";
import { ClinicalCareAccessGrant } from "../models/ClinicalCareAccessGrant.js";
import { PatientSharedConsultationNote } from "../models/PatientSharedConsultationNote.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireIpsClinicalScope } from "../middleware/ipsClinicalScope.js";
import { loi25DataLeakGuard } from "../middleware/loi25DataLeakGuard.js";
import { AdminUser } from "../models/AdminUser.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";
import { PatientConsultationNote } from "../models/PatientConsultationNote.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";
let server,base,ownsDatabase=false;
const users={},tokens={},patients={},encounters={};
async function request(path,actor="ips",method="GET",body){
 const response=await fetch(base+"/api/consultations"+path,{method,headers:{...(tokens[actor]?{Authorization:"Bearer "+tokens[actor]}:{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
}
beforeAll(async()=>{
 const uri=process.env.CLINIA_WALKIN_TEST_URI||"";
 if(process.env.NODE_ENV!=="test"||!/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri))throw Error("Use the disposable local launcher.");
 vi.stubEnv("JWT_ACCESS_SECRET",randomBytes(48).toString("hex"));
 await mongoose.connect(uri,{autoCreate:false,autoIndex:false,serverSelectionTimeoutMS:10000});
 expect((await mongoose.connection.db.admin().command({hello:1})).setName).toBe("walkin_test");
 expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);ownsDatabase=true;
 for(const model of Object.values(mongoose.models)){await model.createCollection();await model.createIndexes();}
 for(const [name,role] of [["ips","IPS"],["other","IPS"],["doctor","MEDECIN"],["unlinked","IPS"],["mismatch","IPS"],["reception","RECEPTION"]]){
  const sid=randomUUID();
  users[name]=await AdminUser.create({username:"synthetic_consult_"+name,email:"consult-"+name+"@example.invalid",passwordHash:"SYNTHETIC_NOT_A_PASSWORD",role,isActive:true,authVersion:0,activeSessionIds:[sid],sessionStartedAt:new Date(),lastActivityAt:new Date()});
  tokens[name]=jwt.sign({sub:String(users[name]._id),role,sid,av:0},process.env.JWT_ACCESS_SECRET,{algorithm:"HS256",issuer:"clinia-backend",audience:"clinia-app",expiresIn:"15m"});
 }
 const professionals={};
 for(const name of ["ips","other","mismatch"]){professionals[name]=await Specialist.create({nom:"SYNTHETIC",prenom:name,numero_medecin:"SYNTHETIC_CONSULT_"+name,specialite:name==="mismatch"?"Medecin de famille":"IPS",accountUserId:users[name]._id});}
 for(const [index,name] of ["owned","unowned","completed","foreignOwner","foreignProfessional","foreignAppointmentOwner","completedForeign"].entries()){
  const owner=name==="unowned"||name==="completed"?null:["foreignOwner","completedForeign"].includes(name)?users.doctor._id:users.ips._id;
  patients[name]=await Patient.create({nom:"SYNTHETIC_CONSULT_"+name,prenom:"TEST",num_assurance_maladie:"SYNTHETIC_CONSULT_"+name,ownerUserId:owner,secure_request_profile:{clinicalNotes:"SYNTHETIC_LEGACY_"+name}});
  encounters[name]=await Appointment.create({patient:patients[name]._id,specialist:professionals[name==="foreignProfessional"?"other":"ips"]._id,ownerUserId:users[name==="foreignAppointmentOwner"?"other":"ips"]._id,date:"2099-01-01",time:"09:"+String(index*5).padStart(2,"0"),status:["completed","completedForeign"].includes(name)?"completed":"scheduled",priority:"normal"});
 }
 await PatientConsultationNote.create([{patientId:patients.completed._id,appointmentId:encounters.completed._id,authorUserId:users.ips._id,note:"SYNTHETIC_OWN_COMPLETED_NOTE"},{patientId:patients.completed._id,appointmentId:encounters.completed._id,authorUserId:users.other._id,note:"SYNTHETIC_FOREIGN_COMPLETED_NOTE"}]);
 const foreignDossierOtherEncounter=await Appointment.create({patient:patients.completedForeign._id,specialist:professionals.other._id,ownerUserId:users.other._id,date:"2099-01-02",time:"09:00",status:"completed",priority:"normal"});
 await PatientConsultationNote.create([
  {patientId:patients.completedForeign._id,appointmentId:encounters.completedForeign._id,authorUserId:users.ips._id,note:"SYNTHETIC_OWN_FOREIGN_DOSSIER_COMPLETED_NOTE"},
  {patientId:patients.completedForeign._id,appointmentId:encounters.completedForeign._id,authorUserId:users.doctor._id,note:"SYNTHETIC_DOCTOR_FOREIGN_DOSSIER_COMPLETED_NOTE"},
  {patientId:patients.completedForeign._id,appointmentId:foreignDossierOtherEncounter._id,authorUserId:users.ips._id,note:"SYNTHETIC_OWN_OTHER_ENCOUNTER_NOTE"},
 ]);
 const app=express();app.use(express.json());
 app.use("/api/consultations",verifyJWT,requireIpsClinicalScope("consultations"),requireRole("MEDECIN","IPS"),loi25DataLeakGuard,consultationsRouter);
 app.use("/api/patients",verifyJWT,requireIpsClinicalScope("patients"),requireRole("MEDECIN","IPS"),loi25DataLeakGuard,patientsRouter);
 server=app.listen(0,"127.0.0.1");await once(server,"listening");base="http://127.0.0.1:"+server.address().port;
});
afterAll(async()=>{try{if(server)await new Promise(resolve=>server.close(resolve));}finally{try{if(ownsDatabase){expect(mongoose.connection.name).toBe("clinia_walkin_integration");await mongoose.connection.dropDatabase();expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);}}finally{await mongoose.disconnect();vi.unstubAllEnvs();}}});
describe("real JWT bounded IPS consultations",()=>{
 it("lists minimal patient identity only for exact assigned IPS encounters",async()=>{
  const response=await request("/");expect(response.status).toBe(200);
  expect(response.body.data.map(row=>String(row._id)).sort()).toEqual(["owned","unowned","completed","foreignOwner","completedForeign"].map(name=>String(encounters[name]._id)).sort());
  expect(JSON.stringify(response.body)).not.toContain("SYNTHETIC_LEGACY");
 });
 it("reads and appends an attributed own note without changing patient ownership",async()=>{
  const read=await request("/"+encounters.owned._id);expect(read.status).toBe(200);expect(read.body.data).toMatchObject({fullHistory:true,inCare:true});
  const result=await request("/"+encounters.owned._id+"/notes","ips","POST",{note:"SYNTHETIC_APPENDED_IPS_NOTE"});
  expect(result.status).toBe(201);
  const note=await PatientConsultationNote.findById(result.body.data._id).lean();expect(String(note.authorUserId)).toBe(String(users.ips._id));
  expect(String((await Patient.findById(patients.owned._id)).ownerUserId)).toBe(String(users.ips._id));
  expect(await PatientAuditLog.countDocuments({patientId:patients.owned._id,actorRole:"IPS",action:"CONSULTATION_NOTE_CREATE"})).toBe(1);
 });
 it("allows an explicitly assigned unowned encounter, then claims care only through acceptance",async()=>{
  const read=await request("/"+encounters.unowned._id);expect(read.status).toBe(200);expect(read.body.data.canAcceptCare).toBe(true);
  expect((await Patient.findById(patients.unowned._id)).ownerUserId).toBeNull();
  expect((await request("/"+encounters.unowned._id+"/notes","ips","POST",{note:"SYNTHETIC_UNOWNED_ENCOUNTER_NOTE"})).status).toBe(201);
  expect((await Patient.findById(patients.unowned._id)).ownerUserId).toBeNull();
  expect((await request("/"+encounters.unowned._id+"/accept-care","ips","POST",{})).status).toBe(200);
  expect(String((await Patient.findById(patients.unowned._id)).ownerUserId)).toBe(String(users.ips._id));
 });
 it("restricts completed unowned consultations to this author's own encounter notes",async()=>{
  const response=await request("/"+encounters.completed._id);expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({fullHistory:false,legacyNote:"",canAddNote:false});
  expect(response.body.data.notes.map(note=>note.note)).toEqual(["SYNTHETIC_OWN_COMPLETED_NOTE"]);
  expect((await request("/"+encounters.completed._id+"/notes","ips","POST",{note:"MUST_NOT_APPEND"})).status).toBe(403);
 });
 it("reads and appends during an assigned encounter while preserving the physician's dossier ownership",async()=>{
  const before=await Patient.findById(patients.foreignOwner._id).lean();
  const read=await request("/"+encounters.foreignOwner._id);expect(read.status).toBe(200);
  expect(read.body.data).toMatchObject({fullHistory:true,inCare:false,canAcceptCare:false,legacyNote:"SYNTHETIC_LEGACY_foreignOwner"});
  const note=await request("/"+encounters.foreignOwner._id+"/notes","ips","POST",{note:"SYNTHETIC_ASSIGNED_IPS_NOTE_FOREIGN_DOSSIER"});
  expect(note.status).toBe(201);
  const saved=await PatientConsultationNote.findById(note.body.data._id).lean();
  expect(String(saved.authorUserId)).toBe(String(users.ips._id));expect(String(saved.appointmentId)).toBe(String(encounters.foreignOwner._id));
  const persisted=await Patient.findById(patients.foreignOwner._id).lean();
  expect(String(persisted.ownerUserId)).toBe(String(users.doctor._id));expect(persisted.secure_request_profile).toEqual(before.secure_request_profile);
  const claim=await request("/"+encounters.foreignOwner._id+"/accept-care","ips","POST",{});
  expect(claim.status).toBe(409);expect(claim.body.error.code).toBe("CARE_ALREADY_ASSIGNED");
  expect(String((await Patient.findById(patients.foreignOwner._id)).ownerUserId)).toBe(String(users.doctor._id));
 });
 it("limits a completed foreign dossier to own notes for that encounter and rejects append or transfer",async()=>{
  const before=await Patient.findById(patients.completedForeign._id).lean();
  const read=await request("/"+encounters.completedForeign._id);expect(read.status).toBe(200);
  expect(read.body.data).toMatchObject({fullHistory:false,legacyNote:"",canAddNote:false,canAcceptCare:false,inCare:false});
  expect(read.body.data.notes.map(note=>note.note)).toEqual(["SYNTHETIC_OWN_FOREIGN_DOSSIER_COMPLETED_NOTE"]);
  expect((await request("/"+encounters.completedForeign._id+"/notes","ips","POST",{note:"MUST_NOT_APPEND"})).status).toBe(403);
  const claim=await request("/"+encounters.completedForeign._id+"/accept-care","ips","POST",{});expect(claim.status).toBe(409);expect(claim.body.error.code).toBe("CARE_ALREADY_ASSIGNED");
  expect(await Patient.findById(patients.completedForeign._id).lean()).toEqual(before);
 });
 it.each(["foreignProfessional","foreignAppointmentOwner"])("denies %s read, append and care acceptance without data mutation",async name=>{
  const before=await Patient.findById(patients[name]._id).lean(),noteCount=await PatientConsultationNote.countDocuments();
  for(const [suffix,method,body] of [["","GET",undefined],["/notes","POST",{note:"MUST_NOT_APPEND"}],["/accept-care","POST",{}]]){
   const response=await request("/"+encounters[name]._id+suffix,"ips",method,body);expect(response.status).toBe(403);expect(response.body.data).toBeUndefined();
  }
  expect(await Patient.findById(patients[name]._id).lean()).toEqual(before);expect(await PatientConsultationNote.countDocuments()).toBe(noteCount);
 });
 it("includes retained shared notes for a WalkIn assigned to another IPS without transferring the dossier",async()=>{
  const ownerProfessional=await Specialist.findOne({accountUserId:users.other._id}).lean();
  const assignedProfessional=await Specialist.findOne({accountUserId:users.ips._id}).lean();
  const returningPatient=await Patient.create({nom:"SYNTHETIC_RETURN_WALKIN",prenom:"TEST_ONLY",num_assurance_maladie:"SYNTHETIC_RETURN_WALKIN",ownerUserId:users.other._id,secure_request_profile:{clinicalNotes:"SYNTHETIC_OWNER_IPS_LEGACY"}});
  const oldEncounter=await Appointment.create({patient:returningPatient._id,specialist:ownerProfessional._id,ownerUserId:users.other._id,date:"2099-01-03",time:"09:00",status:"completed",priority:"normal"});
  const newEncounter=await Appointment.create({patient:returningPatient._id,specialist:assignedProfessional._id,ownerUserId:users.ips._id,date:"2099-01-04",time:"09:00",status:"scheduled",priority:"normal"});
  await PatientConsultationNote.create({patientId:returningPatient._id,appointmentId:oldEncounter._id,authorUserId:users.other._id,note:"SYNTHETIC_OLD_OWNER_IPS_ENCOUNTER",createdAt:new Date("2026-10-30T12:00:00Z")});
  const revoked=await ClinicalCareAccessGrant.create({patientId:returningPatient._id,issuerUserId:users.other._id,targetUserId:users.doctor._id,permission:"READ_APPEND",status:"REVOKED",expiresAt:new Date("2026-10-31T12:00:00Z"),revokedAt:new Date("2026-10-31T11:00:00Z")});
  await PatientSharedConsultationNote.create({patientId:returningPatient._id,grantId:revoked._id,authorUserId:users.doctor._id,authorRole:"MEDECIN",authorSpecialty:"Urgentologue",note:"SYNTHETIC_RETAINED_SHARED_URGENTOLOGIST_NOTE",createdAt:new Date("2026-10-30T13:00:00Z")});
  const before=await Patient.findById(returningPatient._id).lean();
  const read=await request("/"+newEncounter._id);expect(read.status).toBe(200);
  expect(read.body.data).toMatchObject({fullHistory:true,inCare:false,canAcceptCare:false,canAddNote:true,legacyNote:"SYNTHETIC_OWNER_IPS_LEGACY"});
  expect(read.body.data.notes.map(note=>note.note)).toEqual(["SYNTHETIC_OLD_OWNER_IPS_ENCOUNTER","SYNTHETIC_RETAINED_SHARED_URGENTOLOGIST_NOTE"]);
  const appended=await request("/"+newEncounter._id+"/notes","ips","POST",{note:"SYNTHETIC_NEW_ASSIGNED_IPS_NOTE"});expect(appended.status).toBe(201);
  const saved=await PatientConsultationNote.findById(appended.body.data._id).lean();expect(String(saved.authorUserId)).toBe(String(users.ips._id));expect(String(saved.appointmentId)).toBe(String(newEncounter._id));
  const after=await Patient.findById(returningPatient._id).lean();expect(String(after.ownerUserId)).toBe(String(users.other._id));expect(after.secure_request_profile).toEqual(before.secure_request_profile);
  for(const method of ["GET","PATCH"]){
   const response=await fetch(base+"/api/patients/"+returningPatient._id,{method,headers:{Authorization:"Bearer "+tokens.ips,"Content-Type":"application/json"},...(method==="PATCH"?{body:JSON.stringify({nom:"MUST_NOT_CHANGE"})}:{})});expect(response.status).toBe(403);
  }
  expect((await request("/"+newEncounter._id+"/accept-care","ips","POST",{})).status).toBe(409);
  expect((await request("/"+oldEncounter._id)).status).toBe(403);
  const ownerRead=await request("/"+oldEncounter._id,"other");expect(ownerRead.status).toBe(200);expect(ownerRead.body.data.fullHistory).toBe(true);expect(ownerRead.body.data.notes.map(note=>note.note)).toContain("SYNTHETIC_RETAINED_SHARED_URGENTOLOGIST_NOTE");
  await Appointment.updateOne({_id:newEncounter._id},{$set:{status:"completed"}});
  const restricted=await request("/"+newEncounter._id);expect(restricted.status).toBe(200);expect(restricted.body.data).toMatchObject({fullHistory:false,legacyNote:"",canAddNote:false});
  expect(restricted.body.data.notes.map(note=>note.note)).toEqual(["SYNTHETIC_NEW_ASSIGNED_IPS_NOTE"]);
  expect(String((await Patient.findById(returningPatient._id)).ownerUserId)).toBe(String(users.other._id));
 });
 it("bounds retained shared history to the latest 500 entries with a real MongoDB query",async()=>{
  const professional=await Specialist.findOne({accountUserId:users.ips._id}).lean();
  const boundedPatient=await Patient.create({nom:"SYNTHETIC_BOUNDED_HISTORY",prenom:"TEST_ONLY",num_assurance_maladie:"SYNTHETIC_BOUNDED_HISTORY",ownerUserId:users.ips._id});
  const encounter=await Appointment.create({patient:boundedPatient._id,specialist:professional._id,ownerUserId:users.ips._id,date:"2099-01-05",time:"09:00",status:"scheduled",priority:"normal"});
  const revoked=await ClinicalCareAccessGrant.create({patientId:boundedPatient._id,issuerUserId:users.ips._id,targetUserId:users.doctor._id,permission:"READ_APPEND",status:"REVOKED",expiresAt:new Date("2026-10-31T12:00:00Z"),revokedAt:new Date("2026-10-31T11:00:00Z")});
  await PatientSharedConsultationNote.insertMany(Array.from({length:501},(_,index)=>({patientId:boundedPatient._id,grantId:revoked._id,authorUserId:users.doctor._id,authorRole:"MEDECIN",authorSpecialty:"Urgentologue",note:"SYNTHETIC_BOUNDED_SHARED_"+index,createdAt:new Date(Date.UTC(2026,9,30,0,index))})));
  const read=await request("/"+encounter._id);expect(read.status).toBe(200);expect(read.body.data.sharedNotesTruncated).toBe(true);expect(read.body.data.notes).toHaveLength(500);
  expect(read.body.data.notes[0].note).toBe("SYNTHETIC_BOUNDED_SHARED_1");expect(read.body.data.notes.at(-1).note).toBe("SYNTHETIC_BOUNDED_SHARED_500");
  expect(read.body.data.notes.some(note=>note.note==="SYNTHETIC_BOUNDED_SHARED_0")).toBe(false);
 });
 it("requires the exact IPS specialty link, account, role and live session",async()=>{
  for(const actor of ["unlinked","mismatch","reception"])expect((await request("/",actor)).status).toBe(403);
  expect((await request("/","anonymous")).status).toBe(401);
  await AdminUser.updateOne({_id:users.ips._id},{$set:{isActive:false}});
  expect((await request("/")).status).toBe(401);
 });
});
