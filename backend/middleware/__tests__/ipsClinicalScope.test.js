import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUser } from "../../models/AdminUser.js";
import { Specialist } from "../../models/Specialist.js";
import { Patient } from "../../models/Patient.js";
import { Appointment } from "../../models/Appointment.js";
import { buildOwnerScope, isPrivilegedUser } from "../../auth/resourceAccess.js";
import { requireRole } from "../requireRole.js";
import { requireIpsClinicalScope } from "../ipsClinicalScope.js";

const userId="507f1f77bcf86cd799439011", professional="507f1f77bcf86cd799439012", patient="507f1f77bcf86cd799439013", appointment="507f1f77bcf86cd799439014";
const q=value=>({lean:vi.fn().mockResolvedValue(value)});
function request(method,path,extra={}){return {method,path,auth:{userId,role:"IPS"},body:{},query:{},...extra};}
function response(){return {status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};}
async function run(resource,req){const res=response(),next=vi.fn();await requireIpsClinicalScope(resource)(req,res,next);return {res,next};}
beforeEach(()=>{
 vi.spyOn(AdminUser,"findOne").mockImplementation(()=>q({_id:userId}));
 vi.spyOn(Specialist,"find").mockImplementation(()=>q([{_id:professional}]));
 vi.spyOn(Patient,"exists").mockResolvedValue(null);
 vi.spyOn(Appointment,"exists").mockResolvedValue(null);
});
afterEach(()=>vi.restoreAllMocks());

describe("explicit limited IPS capability scope (no physician-role alias)",()=>{
 it.each(["MEDECIN","ADMIN","SUPERADMIN","RECEPTION","USER"])("leaves %s to its existing role guards, without IPS entitlements",async role=>{
  const {next}=await run("patients",request("GET","/",{auth:{userId,role}}));
  expect(next).toHaveBeenCalledOnce();expect(AdminUser.findOne).not.toHaveBeenCalled();
  if(["ADMIN","SUPERADMIN","RECEPTION","USER"].includes(role)){
   const res=response();const finalNext=vi.fn();requireRole("IPS","MEDECIN")({auth:{userId,role}},res,finalNext);
   expect(res.status).toHaveBeenCalledWith(403);expect(finalNext).not.toHaveBeenCalled();
  }
 });
 it("never gives IPS an empty owner scope or privileged platform access",()=>{
  expect(buildOwnerScope({userId,role:"IPS"})).toEqual({ownerUserId:userId});
  expect(isPrivilegedUser({userId,role:"IPS"})).toBe(false);
 });
 it("requires current IPS account identity and a matching IPS directory link",async()=>{
  const {next}=await run("patients",request("GET","/"));expect(next).toHaveBeenCalledOnce();
  expect(AdminUser.findOne).toHaveBeenCalledWith({_id:userId,role:"IPS",isActive:true},{_id:1});
  expect(Specialist.find).toHaveBeenCalledWith({accountUserId:userId,specialite:"IPS"},{_id:1});
 });
 it("rejects inactive or changed-role accounts before accessing patients",async()=>{
  AdminUser.findOne.mockReturnValue(q(null));const {res,next}=await run("patients",request("GET","/"));
  expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();expect(Patient.exists).not.toHaveBeenCalled();
 });
 it("rejects missing or mismatched IPS professional links",async()=>{
  Specialist.find.mockReturnValue(q([]));const {res,next}=await run("patients",request("GET","/"));
  expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 });
 it.each(["",null,{},"doctor-1"])("rejects malformed session identity %#",async userId=>{
  const {res,next}=await run("patients",request("GET","/",{auth:{userId,role:"IPS"}}));
  expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 });
 it.each(["GET","PATCH"])("allows %s only for an exact nonarchived owned patient",async method=>{
  Patient.exists.mockResolvedValue({_id:patient});const {next}=await run("patients",request(method,"/"+patient));
  expect(next).toHaveBeenCalledOnce();expect(Patient.exists).toHaveBeenCalledWith({_id:patient,ownerUserId:userId,archivedAt:null});
 });
 it("denies guessed, foreign or archived patient IDs",async()=>{
  const {res,next}=await run("patients",request("GET","/"+patient));expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 });
 it.each([['GET','/audit-logs'],['GET','/export'],['DELETE','/'+patient],['POST','/'+patient+'/restore'],['POST','/'+patient+'/clinical-note-versions/'+appointment+'/restore']])("rejects unapproved IPS patient operation %s %s",async(method,path)=>{
  Patient.exists.mockResolvedValue({_id:patient});const {res,next}=await run("patients",request(method,path));expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 });
 it.each(["ownerUserId","receivingPhysicianUserId"])("rejects forged patient ownership field %s",async key=>{
  const {res,next}=await run("patients",request("POST","/",{body:{[key]:professional}}));expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 });
 it.each(["GET","DELETE","PATCH","POST"])("requires both own appointment and own IPS professional for %s",async method=>{
  Appointment.exists.mockResolvedValue({_id:appointment});const suffix=method==='PATCH'?'/status':method==='POST'?'/reschedule':'';
  const {next}=await run("appointments",request(method,"/"+appointment+suffix));
  expect(next).toHaveBeenCalledOnce();expect(Appointment.exists).toHaveBeenCalledWith({_id:appointment,ownerUserId:userId,specialist:{$in:[professional]}});
 });
 it("denies unassigned appointment IDs",async()=>{
  const {res,next}=await run("appointments",request("GET","/"+appointment));expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 });
 it("requires own patient and own IPS professional when creating an appointment",async()=>{
  Patient.exists.mockResolvedValue({_id:patient});const {next}=await run("appointments",request("POST","/",{body:{patient,specialist:professional}}));expect(next).toHaveBeenCalledOnce();
  const denied=await run("appointments",request("POST","/",{body:{patient,specialist:appointment}}));expect(denied.res.status).toHaveBeenCalledWith(403);expect(denied.next).not.toHaveBeenCalled();
 });
 it("denies clinical lookup using another professional or foreign patient",async()=>{
  const a=await run("appointments",request("GET","/slots",{query:{patient,specialist:professional}}));expect(a.res.status).toHaveBeenCalledWith(403);
  const b=await run("appointments",request("GET","/slots",{query:{specialist:appointment}}));expect(b.res.status).toHaveBeenCalledWith(403);
 });
 it.each([['GET','/coordination-requests'],['POST','/coordination-requests'],['GET','/availability-requests']])("denies unapproved IPS scheduling operation %s %s",async(method,path)=>{
  const {res,next}=await run("appointments",request(method,path));expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 });
 it.each([['GET','/'],['GET','/'+appointment],['POST','/'+appointment+'/notes'],['POST','/'+appointment+'/accept-care']])("allows only enumerated consultation paths %s %s",async(method,path)=>{
  const {next}=await run("consultations",request(method,path));expect(next).toHaveBeenCalledOnce();
 });
 it("does not authorize arbitrary resources or directory writes",async()=>{
  for(const [resource,method,path] of [['admin','GET','/'],['reception','POST','/walk-in-bookings'],['directory','PATCH','/'+professional],['consultations','DELETE','/'+appointment]]){
   const {res,next}=await run(resource,request(method,path));expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
  }
 });
 it("fails closed on access-check errors without exposing internals",async()=>{
  AdminUser.findOne.mockImplementation(()=>{throw Error('private database internals');});
  const {res,next}=await run("patients",request("GET","/"));expect(res.status).toHaveBeenCalledWith(503);expect(next).not.toHaveBeenCalled();expect(JSON.stringify(res.json.mock.calls)).not.toContain('database internals');
 });
});
