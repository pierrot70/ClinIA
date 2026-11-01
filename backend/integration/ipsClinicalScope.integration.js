// Permission proof uses real JWT validation, real patient/appointment routers
// and disposable MongoDB. It does not mount or alter production app routes.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import patientsRouter from "../routes/patients.js";
import appointmentsRouter from "../routes/appointments.js";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireIpsClinicalScope } from "../middleware/ipsClinicalScope.js";
import { loi25DataLeakGuard } from "../middleware/loi25DataLeakGuard.js";
import { AdminUser } from "../models/AdminUser.js";
import { Specialist } from "../models/Specialist.js";
import { Patient } from "../models/Patient.js";
import { Appointment } from "../models/Appointment.js";
import { PatientAuditLog } from "../models/PatientAuditLog.js";

let server, base, ownsDatabase=false, users={},tokens={},owned,foreign,ownAppointment,foreignAppointment;
async function request(path,actor='ips',method='GET',body){
 const r=await fetch(base+path,{method,headers:{...(tokens[actor]?{Authorization:'Bearer '+tokens[actor]}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json()};
}
beforeAll(async()=>{
 const uri=process.env.CLINIA_WALKIN_TEST_URI||'';
 if(process.env.NODE_ENV!=='test'||!/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri))throw Error('Use the disposable local launcher.');
 vi.stubEnv('JWT_ACCESS_SECRET',randomBytes(48).toString('hex'));
 await mongoose.connect(uri,{autoCreate:false,autoIndex:false,serverSelectionTimeoutMS:10000});
 expect((await mongoose.connection.db.admin().command({hello:1})).setName).toBe('walkin_test');
 expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);ownsDatabase=true;
 for(const model of Object.values(mongoose.models)){await model.createCollection();await model.createIndexes();}
 for(const [name,role] of [['ips','IPS'],['other','IPS'],['unlinked','IPS'],['admin','ADMIN'],['reception','RECEPTION']]){
  const sid=randomUUID();users[name]=await AdminUser.create({username:'synthetic_scope_'+name,email:'scope-'+name+'@example.invalid',passwordHash:'SYNTHETIC_NOT_A_PASSWORD',role,isActive:true,authVersion:0,activeSessionIds:[sid],sessionStartedAt:new Date(),lastActivityAt:new Date()});
  tokens[name]=jwt.sign({sub:String(users[name]._id),role,sid,av:0},process.env.JWT_ACCESS_SECRET,{algorithm:'HS256',issuer:'clinia-backend',audience:'clinia-app',expiresIn:'15m'});
 }
 const professional=await Specialist.create({nom:'SYNTHETIC',prenom:'IPS',numero_medecin:'SYNTHETIC_SCOPE_IPS',specialite:'IPS',accountUserId:users.ips._id});
 const otherProfessional=await Specialist.create({nom:'SYNTHETIC',prenom:'OTHER',numero_medecin:'SYNTHETIC_SCOPE_OTHER',specialite:'IPS',accountUserId:users.other._id});
 owned=await Patient.create({nom:'SYNTHETIC_SCOPE_OWNED',prenom:'TEST',num_assurance_maladie:'SYNTHETIC_SCOPE_OWNED',ownerUserId:users.ips._id,secure_request_profile:{clinicalNotes:'Synthetic owner note'}});
 foreign=await Patient.create({nom:'SYNTHETIC_SCOPE_FOREIGN',prenom:'TEST',num_assurance_maladie:'SYNTHETIC_SCOPE_FOREIGN',ownerUserId:users.other._id,secure_request_profile:{clinicalNotes:'Synthetic foreign note'}});
 ownAppointment=await Appointment.create({patient:owned._id,specialist:professional._id,ownerUserId:users.ips._id,date:'2099-01-01',time:'09:00',status:'scheduled',priority:'normal'});
 foreignAppointment=await Appointment.create({patient:foreign._id,specialist:otherProfessional._id,ownerUserId:users.other._id,date:'2099-01-01',time:'09:15',status:'scheduled',priority:'normal'});
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.requestContext={requestId:randomUUID(),instanceId:'synthetic-ips-scope'};next();});
 app.use('/api/patients',verifyJWT,requireIpsClinicalScope('patients'),requireRole('IPS','MEDECIN','ADMIN','SUPERADMIN'),loi25DataLeakGuard,patientsRouter);
 app.use('/api/appointments',verifyJWT,requireIpsClinicalScope('appointments'),requireRole('IPS','MEDECIN','ADMIN','SUPERADMIN'),loi25DataLeakGuard,appointmentsRouter);
 app.get('/api/admin-proof',verifyJWT,requireRole('ADMIN','SUPERADMIN'),(_req,res)=>res.json({ok:true}));
 app.get('/api/reception-proof',verifyJWT,requireRole('RECEPTION'),(_req,res)=>res.json({ok:true}));
 server=app.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;
});
afterAll(async()=>{try{if(server)await new Promise(resolve=>server.close(resolve));}finally{try{if(ownsDatabase){expect(mongoose.connection.name).toBe('clinia_walkin_integration');await mongoose.connection.dropDatabase();}}finally{await mongoose.disconnect();vi.unstubAllEnvs();}}});

describe('actual mounted IPS owner scope with JWT and disposable MongoDB',()=>{
 it('does not expose foreign patients through list, detail or secure document paths',async()=>{
  const list=await request('/api/patients');expect(list.status).toBe(200);expect(JSON.stringify(list.body)).toContain('SYNTHETIC_SCOPE_OWNED');expect(JSON.stringify(list.body)).not.toContain('SYNTHETIC_SCOPE_FOREIGN');
  expect(list.body.data.data).toHaveLength(1);expect(list.body.data.data[0].ownerUserId).toBe(String(users.ips._id));
  expect(list.body.data.data[0]).not.toHaveProperty('secure_request_profile');
  const own=await request('/api/patients/'+owned._id);expect(own.status).toBe(200);expect(JSON.stringify(own.body)).toContain('Synthetic owner note');
  expect((await request('/api/patients/'+foreign._id)).status).toBe(403);
  expect((await request('/api/patients/'+foreign._id+'/secure-request-documents')).status).toBe(403);
 });
 it('allows a clinical update only on the owned active record and preserves its owner',async()=>{
  const patched=await request('/api/patients/'+owned._id,'ips','PATCH',{secure_request_profile:{clinicalNotes:'Synthetic updated own note'}});
  expect(patched.status).toBe(200);
  expect((await request('/api/patients/'+foreign._id,'ips','PATCH',{secure_request_profile:{clinicalNotes:'Must not change'}})).status).toBe(403);
  expect((await request('/api/patients/'+owned._id,'ips','PATCH',{ownerUserId:String(users.other._id)})).status).toBe(403);
  const saved=await Patient.findById(owned._id).lean();expect(String(saved.ownerUserId)).toBe(String(users.ips._id));expect(saved.secure_request_profile.clinicalNotes).toBe('Synthetic updated own note');
  expect((await Patient.findById(foreign._id).lean()).secure_request_profile.clinicalNotes).toBe('Synthetic foreign note');
  expect(await PatientAuditLog.countDocuments({patientId:owned._id,actorRole:'IPS'})).toBeGreaterThan(0);
 });
 it('denies archive, restore, audit export and admin/reception endpoints to IPS',async()=>{
  for(const [method,path] of [['GET','/api/patients?archiveStatus=archived'],['DELETE','/api/patients/'+owned._id],['POST','/api/patients/'+owned._id+'/restore'],['GET','/api/patients/audit-logs'],['GET','/api/admin-proof'],['GET','/api/reception-proof']])expect((await request(path,'ips',method,method==='POST'?{}:undefined)).status).toBe(403);
 });
 it('lists and reads only own IPS appointments and refuses foreign IDs',async()=>{
  const listed=await request('/api/appointments');expect(listed.status).toBe(200);expect(JSON.stringify(listed.body)).toContain(String(ownAppointment._id));expect(JSON.stringify(listed.body)).not.toContain(String(foreignAppointment._id));
  expect((await request('/api/appointments/'+ownAppointment._id)).status).toBe(200);
  expect((await request('/api/appointments/'+foreignAppointment._id)).status).toBe(403);
 });
 it('requires a current IPS directory link, account activity and authenticated session',async()=>{
  expect((await request('/api/patients','unlinked')).status).toBe(403);
  expect((await request('/api/patients','anonymous')).status).toBe(401);
  await AdminUser.updateOne({_id:users.ips._id},{$set:{isActive:false}});
  expect((await request('/api/patients')).status).toBe(401);
 });
});
