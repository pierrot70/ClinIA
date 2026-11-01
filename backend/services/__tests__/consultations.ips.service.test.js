import mongoose from "mongoose";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AdminUser } from "../../models/AdminUser.js";
import { Specialist } from "../../models/Specialist.js";
import { Appointment } from "../../models/Appointment.js";
import { Patient } from "../../models/Patient.js";
import { PatientConsultationNote } from "../../models/PatientConsultationNote.js";
import { PatientSharedConsultationNote } from "../../models/PatientSharedConsultationNote.js";
import { PatientAuditLog } from "../../models/PatientAuditLog.js";
import { listConsultations, readConsultation, addConsultationNote, acceptPatientCare } from "../consultations.js";
const ips="507f1f77bcf86cd799439081", specialist="507f1f77bcf86cd799439082", appointmentId="507f1f77bcf86cd799439083", patientId="507f1f77bcf86cd799439084", foreign="507f1f77bcf86cd799439085";
const auth={userId:ips,role:"IPS",username:"SyntheticIPS"};
const query=data=>({session:vi.fn().mockReturnThis(),sort:vi.fn().mockReturnThis(),limit:vi.fn().mockReturnThis(),lean:vi.fn().mockResolvedValue(data)});
const session={withTransaction:vi.fn(async cb=>cb()),endSession:vi.fn()};
let patient,appointment;
beforeEach(()=>{
    vi.spyOn(PatientSharedConsultationNote, "find").mockImplementation(() => query([]));
 patient={_id:patientId,nom:"Synthetic",prenom:"IPSFixture",ownerUserId:null,secure_request_profile:{clinicalNotes:"Synthetic legacy note"}};
 appointment={_id:appointmentId,patient:patientId,specialist,ownerUserId:ips,status:"scheduled"};
 vi.spyOn(AdminUser,"findOne").mockImplementation(()=>query({_id:ips}));
 vi.spyOn(AdminUser,"find").mockImplementation(()=>query([]));
 vi.spyOn(Specialist,"find").mockImplementation(()=>query([{_id:specialist}]));
 vi.spyOn(Appointment,"findOne").mockImplementation(filter=>query(filter.ownerUserId===appointment.ownerUserId&&filter.specialist.$in.includes(appointment.specialist)?appointment:null));
 vi.spyOn(Appointment,"find").mockImplementation(filter=>query(filter.ownerUserId===ips?[appointment]:[]));
 vi.spyOn(Patient,"findOne").mockImplementation(filter=>query(!filter.$or||filter.$or.some(scope=>scope.ownerUserId===patient.ownerUserId)?patient:null));
 vi.spyOn(Patient,"find").mockImplementation(filter=>query([{_id:patientId,nom:patient.nom,prenom:patient.prenom}]));
 vi.spyOn(PatientConsultationNote,"find").mockImplementation(()=>query([]));
 vi.spyOn(PatientConsultationNote,"create").mockResolvedValue([{_id:"note"}]);
 for(const model of [AdminUser,Specialist,Appointment,Patient])vi.spyOn(model,"updateOne").mockResolvedValue({modifiedCount:1});
 vi.spyOn(PatientAuditLog,"create").mockResolvedValue([{_id:"audit"}]);
 vi.spyOn(mongoose,"startSession").mockResolvedValue(session);
});
afterEach(()=>vi.restoreAllMocks());
describe("bounded IPS consultation service policy",()=>{
 it.each([null,ips,foreign])("reads only an assigned IPS encounter, preserving any dossier owner (%s)",async owner=>{
  patient.ownerUserId=owner;
  const result=await readConsultation(appointmentId,auth);
  expect(result.fullHistory).toBe(true);
  expect(AdminUser.findOne).toHaveBeenCalledWith({_id:ips,role:"IPS",isActive:true},{_id:1});
  expect(Specialist.find).toHaveBeenCalledWith({accountUserId:ips,specialite:"IPS"},{_id:1});
  expect(Appointment.findOne).toHaveBeenCalledWith(expect.objectContaining({ownerUserId:ips,specialist:{$in:[specialist]}}),expect.anything());
  expect(Patient.findOne).toHaveBeenCalledWith({_id:patientId,archivedAt:null},expect.anything());
 });
 it("lists minimal identity only for assigned own encounters, regardless of the dossier owner",async()=>{
  const result=await listConsultations(auth);expect(result).toHaveLength(1);
  expect(Appointment.find).toHaveBeenCalledWith(expect.objectContaining({ownerUserId:ips,specialist:{$in:[specialist]}}),expect.anything());
  expect(Patient.find).toHaveBeenCalledWith({_id:{$in:[patientId]},archivedAt:null},{nom:1,prenom:1});
 });
 it("reads history and appends an encounter note without transferring a foreign dossier",async()=>{
  patient.ownerUserId=foreign;
  expect(await readConsultation(appointmentId,auth)).toMatchObject({fullHistory:true,inCare:false,canAcceptCare:false,legacyNote:"Synthetic legacy note"});
  await addConsultationNote(appointmentId,"Synthetic assigned encounter note",auth);
  expect(Patient.updateOne).toHaveBeenCalledExactlyOnceWith({_id:patientId,archivedAt:null,ownerUserId:foreign},{$inc:{__v:1}},{session});
  expect(PatientConsultationNote.create).toHaveBeenCalledWith([{patientId,appointmentId,authorUserId:ips,note:"Synthetic assigned encounter note"}],{session});
  expect(patient.ownerUserId).toBe(foreign);
 });
 it("restricts completed foreign care to the IPS author's notes for this exact encounter",async()=>{
  appointment.status="completed";patient.ownerUserId=foreign;
  expect(await readConsultation(appointmentId,auth)).toMatchObject({fullHistory:false,legacyNote:"",canAddNote:false,canAcceptCare:false,inCare:false});
  expect(PatientConsultationNote.find).toHaveBeenCalledWith({patientId,authorUserId:ips,appointmentId},expect.anything());
  await expect(addConsultationNote(appointmentId,"Must not append",auth)).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(PatientConsultationNote.create).not.toHaveBeenCalled();
 });
 it("merges retained shared entries only into authorized full history with stable attribution and order",async()=>{
  patient.ownerUserId=foreign;
  PatientConsultationNote.find.mockReturnValue(query([{_id:"b",note:"Encounter",authorUserId:ips,appointmentId,createdAt:new Date("2026-10-30T13:00:00Z")} ]));
  PatientSharedConsultationNote.find.mockReturnValue(query([{_id:"a",note:"Retained shared",authorUserId:foreign,authorRole:"MEDECIN",authorSpecialty:"Urgentologue",createdAt:new Date("2026-10-30T12:00:00Z")} ]));
  AdminUser.find.mockReturnValue(query([{_id:foreign,username:"SyntheticUrgentologist"},{_id:ips,username:"SyntheticIPS"}]));
  const result=await readConsultation(appointmentId,auth);
  expect(result.notes.map(note=>note.note)).toEqual(["Retained shared","Encounter"]);
  expect(result.sharedNotesTruncated).toBe(false);
  expect(result.notes[0]).toMatchObject({source:"SHARED",appointmentId:null,authorRole:"MEDECIN",authorSpecialty:"Urgentologue",author:"SyntheticUrgentologist"});
  expect(result.notes[1]).toMatchObject({source:"CONSULTATION",appointmentId,authorRole:null,authorSpecialty:null});
  expect(PatientSharedConsultationNote.find).toHaveBeenCalledWith({patientId},expect.objectContaining({authorRole:1,authorSpecialty:1}));
  expect(patient.ownerUserId).toBe(foreign);expect(Patient.updateOne).not.toHaveBeenCalled();
 });
 it("queries at most 501 shared entries and returns only the latest 500 with an explicit truncation flag",async()=>{
  patient.ownerUserId=foreign;
  const entries=Array.from({length:501},(_,index)=>({_id:String(index).padStart(24,"0"),note:"Shared "+index,authorUserId:foreign,authorRole:"MEDECIN",authorSpecialty:"Urgentologue",createdAt:new Date(Date.UTC(2026,9,30,0,index))})).reverse();
  const sharedQuery=query(entries);PatientSharedConsultationNote.find.mockReturnValue(sharedQuery);
  const result=await readConsultation(appointmentId,auth);
  expect(sharedQuery.sort).toHaveBeenCalledWith({createdAt:-1,_id:-1});expect(sharedQuery.limit).toHaveBeenCalledWith(501);
  expect(result.sharedNotesTruncated).toBe(true);expect(result.notes).toHaveLength(500);
  expect(result.notes[0].note).toBe("Shared 1");expect(result.notes.at(-1).note).toBe("Shared 500");
  expect(result.notes.some(note=>note.note==="Shared 0")).toBe(false);
 });
 it("does not even query non-encounter shared entries for completed foreign care",async()=>{
  patient.ownerUserId=foreign;appointment.status="completed";
  const result=await readConsultation(appointmentId,auth);
  expect(result.fullHistory).toBe(false);expect(result.sharedNotesTruncated).toBe(false);expect(PatientSharedConsultationNote.find).not.toHaveBeenCalled();
  expect(PatientConsultationNote.find).toHaveBeenCalledWith({patientId,authorUserId:ips,appointmentId},expect.anything());
 });
 it("retains full history for an explicitly owned IPS patient after completion",async()=>{
  appointment.status="completed";patient.ownerUserId=ips;
  expect(await readConsultation(appointmentId,auth)).toMatchObject({fullHistory:true,inCare:true,legacyNote:"Synthetic legacy note"});
 });
 it.each(["owner","specialist"])("refuses mismatched appointment %s before patient reads",async mismatch=>{
  if(mismatch==="owner")appointment.ownerUserId=foreign;else appointment.specialist=foreign;
  await expect(readConsultation(appointmentId,auth)).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(Appointment.findOne).toHaveBeenCalled();expect(Patient.findOne).not.toHaveBeenCalled();
 });
 it("retains only the IPS author's encounter notes after completed unowned care",async()=>{
  appointment.status="completed";
  const result=await readConsultation(appointmentId,auth);
  expect(result).toMatchObject({fullHistory:false,legacyNote:"",canAddNote:false});
  expect(PatientConsultationNote.find).toHaveBeenCalledWith({patientId,authorUserId:ips,appointmentId},expect.anything());
 });
 it("appends using IPS attribution and rechecks exact ownership in all authorization locks",async()=>{
  await addConsultationNote(appointmentId," Synthetic IPS note ",auth);
  expect(AdminUser.updateOne).toHaveBeenCalledWith({_id:ips,role:"IPS",isActive:true},{$inc:{__v:1}},{session});
  expect(Specialist.updateOne).toHaveBeenCalledWith({_id:specialist,accountUserId:ips,specialite:"IPS"},{$inc:{__v:1}},{session});
  expect(Appointment.updateOne).toHaveBeenCalledWith({_id:appointmentId,status:"scheduled",ownerUserId:ips,specialist:{$in:[specialist]}},{$inc:{__v:1}},{session});
  expect(Patient.updateOne).toHaveBeenCalledWith({_id:patientId,archivedAt:null,ownerUserId:null},{$inc:{__v:1}},{session});
  expect(PatientConsultationNote.create).toHaveBeenCalledWith([{patientId,appointmentId,authorUserId:ips,note:"Synthetic IPS note"}],{session});
  expect(PatientAuditLog.create.mock.calls[0][0][0]).toMatchObject({actorRole:"IPS",actorUserId:ips});
 });
 it("claims an unowned patient only through explicit conditional acceptance",async()=>{
  expect(await acceptPatientCare(appointmentId,auth)).toEqual({accepted:true});
  expect(Patient.updateOne).toHaveBeenCalledWith({_id:patientId,archivedAt:null,ownerUserId:null},{$set:{ownerUserId:ips}},{session});
 });
 it("refuses transfer of a dossier already owned by another professional with a care conflict",async()=>{
  patient.ownerUserId=foreign;
  await expect(acceptPatientCare(appointmentId,auth)).rejects.toMatchObject({code:"CARE_ALREADY_ASSIGNED"});
  expect(Patient.findOne).toHaveBeenCalled();expect(Patient.updateOne).not.toHaveBeenCalled();
 });
 it.each([AdminUser,Specialist,Appointment,Patient])("refuses an authorization change at lock %# before appending",async model=>{
  model.updateOne.mockResolvedValueOnce({modifiedCount:0});
  await expect(addConsultationNote(appointmentId,"Synthetic note",auth)).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(model.updateOne).toHaveBeenCalled();expect(PatientConsultationNote.create).not.toHaveBeenCalled();
 });
 it.each(["inactive","unlinked"])("fails closed on an %s current IPS identity",async state=>{
  if(state==="inactive")AdminUser.findOne.mockReturnValue(query(null));else Specialist.find.mockReturnValue(query([]));
  await expect(readConsultation(appointmentId,auth)).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(AdminUser.findOne).toHaveBeenCalledWith({_id:ips,role:"IPS",isActive:true},{_id:1});
  expect(Patient.findOne).not.toHaveBeenCalled();
 });
 it("rejects an owner change during an encounter note transaction",async()=>{
  patient.ownerUserId=foreign;
  Patient.updateOne.mockResolvedValueOnce({modifiedCount:0});
  await expect(addConsultationNote(appointmentId,"Must not append after owner change",auth)).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(Patient.updateOne).toHaveBeenCalledWith({_id:patientId,archivedAt:null,ownerUserId:foreign},{$inc:{__v:1}},{session});
  expect(PatientConsultationNote.create).not.toHaveBeenCalled();
 });

});
