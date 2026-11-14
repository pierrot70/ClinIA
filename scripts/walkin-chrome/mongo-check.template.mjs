import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { AdminUser } from './models/AdminUser.js';
import { Clinique } from './models/Clinique.js';
import { Patient } from './models/Patient.js';
import { Appointment } from './models/Appointment.js';
import { WalkInWaitlistEntry } from './models/WalkInWaitlistEntry.js';
import { listWalkInFamilyMedicineOptions } from './services/reception.js';
import { buildPatientSearchKeys } from './utils/patientSearchKeys.js';


const { fixtures, action, index, state, target } = __WALKIN_INPUT__;
const { clinicId: expectedClinicId, original, userId } = target;
assert.equal(process.env.NODE_ENV,'production');
await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:5000});
try{
const clinic=await Clinique.findOne({_id:expectedClinicId,nom:'Clinique fictive WalkIn b07ba073'},{_id:1,lat:1}).lean();assert.ok(clinic&&clinic.lat<=-70);
const clinicId=String(clinic._id);
const scoped={_id:userId,username:'receptioncool1',role:'RECEPTION',isActive:true};
const user=await AdminUser.findOne(scoped,{assignedClinics:1}).lean();assert.ok(user);
const current=user.assignedClinics.map(String), temporary=[original[0],clinicId];

const db=mongoose.connection.db;

assert.equal(fixtures.length,12);
for (const f of fixtures) {
 assert.match(f.insurance,/^WLFX\d{8}$/);
 const suffix=f.insurance.slice(4);
 assert.deepEqual([f.first,f.last,f.email,f.oldEmail],[
  'Essai', 'PasseWalkIn'+suffix, 'apres-passe-'+suffix+'@example.invalid', 'avant-passe-'+suffix+'@example.invalid',
 ]);
}
const i=index;
const fixture=fixtures[i];
const scopeEntries={clinic:new mongoose.Types.ObjectId(clinicId),enrolledBy:new mongoose.Types.ObjectId(userId)};
const entryProjection={_id:1,patient:1,channel:1,consentedAt:1};
const byEntry=()=>db.collection('walkinwaitlistentries').find(scopeEntries,{projection:entryProjection}).sort({_id:1}).toArray();
const byFixture=(f)=>db.collection('patients').find({$or:[
 {healthInsuranceNumberSearch:f.insurance},{num_assurance_maladie:f.insurance},{nom:f.last,prenom:f.first},{courriel:{$in:[f.oldEmail,f.email]}}
]},{projection:{_id:1,nom:1,prenom:1,ownerUserId:1,courriel:1,telephone:1,telephoneSms:1,num_assurance_maladie:1,healthInsuranceNumberSearch:1,updatedAt:1}}).limit(3).toArray();
const set=async(from,to)=>assert.equal((await AdminUser.updateOne({...scoped,assignedClinics:from},{$set:{assignedClinics:to}},{runValidators:true})).modifiedCount,1);
const read=async f=>{
 const patients=await byFixture(f);
 const entries=await byEntry();
 return {patients,entries};
};
if(action==='preflight' || action==='prepare'){
 assert.deepEqual(current,original);
 for(const f of fixtures){
  assert.deepEqual(await byFixture(f),[]);
  const phones=[f.oldPhone,f.phone].map(telephone=>buildPatientSearchKeys({telephone}).telephoneSearch);
  assert.equal(await Patient.exists({ownerUserId:null,telephoneSearch:{$in:phones}}),null);
 }
 const baseEntryIds=(await byEntry()).map(e=>String(e._id));
 if(action==='preflight'){
  console.log(JSON.stringify({baseEntryIds}));
 }else{
 assert.deepEqual(baseEntryIds,state.baseEntryIds);
 await set(original,temporary);
 try{
  for(const [extendedSearchAccepted,km] of [[false,110],[true,200]]){
   const result=await listWalkInFamilyMedicineOptions({clinicId,authUser:{userId,role:'RECEPTION'},extendedSearchAccepted});
   assert.deepEqual([result.search.status,result.search.maxDistanceKm,Boolean(result.search.hasUnlocatedClinics),result.today.length,result.future.length],['exhausted',km,false,0,0]);
  }
  const initial=[];
  const session=await mongoose.startSession();
  try{
   await session.withTransaction(async()=>{
    initial.length=0;
    for(const f of fixtures){
     if(f.type!=='existant'){initial.push(null);continue;}
     const dto={nom:f.last,prenom:f.first,num_assurance_maladie:f.insurance,telephone:f.oldPhone,telephoneSms:f.oldSms,courriel:f.oldEmail,country:'CA',healthInsuranceJurisdiction:'QC'};
     const [p]=await Patient.create([{...dto,...buildPatientSearchKeys(dto),ownerUserId:null}],{session});
     initial.push({id:String(p._id),updatedAt:p.updatedAt.toISOString()});
    }
   });
  }finally{await session.endSession();}
  console.log(JSON.stringify({ready:true,baseEntryIds,initial,saved:[]}));
 }catch(error){await set(temporary,original);throw error;}
 }
}else if(action==='verify'){
 assert.deepEqual(current,temporary);
 const {patients,entries}=await read(fixture);
 const baseline=state.initial[i];
 const expectedIds=[...state.baseEntryIds,...state.saved.map(e=>e.entryId)].sort();
 const actualIds=entries.map(e=>String(e._id)).sort();
 const channel={appel:'phone',SMS:'sms',courriel:'email'}[fixture.order[2]];
 assert.equal(patients.length,1,'Dossier unique attendu');
 const [p]=patients;
 assert.deepEqual([p.nom,p.prenom,p.num_assurance_maladie,p.healthInsuranceNumberSearch,p.ownerUserId,p.telephone,p.telephoneSms,p.courriel],
  [fixture.last,fixture.first,fixture.insurance,fixture.insurance,null,fixture.phone,fixture.sms,fixture.email]);
 if(baseline) assert.equal(String(p._id),baseline.id,'Le dossier existant a changé d’identifiant');
 const added=entries.filter(e=>!expectedIds.includes(String(e._id)));
 assert.equal(added.length,1,'Une seule inscription doit être créée');
 const [entry]=added;
 assert.deepEqual(actualIds,[...expectedIds,String(entry._id)].sort());
 assert.equal(String(entry.patient),String(p._id));
 assert.equal(entry.channel,channel);
 assert.ok(entry.consentedAt instanceof Date);
 assert.equal(await WalkInWaitlistEntry.countDocuments({patient:p._id}),1);
 assert.equal(await Appointment.countDocuments({patient:p._id}),0);
 console.log(JSON.stringify({scenario:i+1,patients:1,newEntries:1,entryId:String(entry._id),patientId:String(p._id),channel}));
}else if(action==='cleanup'){
 try{
  for(const f of fixtures){
   const found=await byFixture(f);
   for(const p of found){
    assert.deepEqual([p.nom,p.prenom,p.num_assurance_maladie,p.ownerUserId],[f.last,f.first,f.insurance,null]);
    const session=await mongoose.startSession();
    try{await session.withTransaction(async()=>{
     assert.equal(await Appointment.countDocuments({patient:p._id}).session(session),0);
     const linked=await WalkInWaitlistEntry.find({patient:p._id},{_id:1,clinic:1,enrolledBy:1}).session(session).lean();
     assert.ok(linked.every(e=>String(e.clinic)===clinicId&&String(e.enrolledBy)===userId&&!state.baseEntryIds.includes(String(e._id))));
     const removed=await WalkInWaitlistEntry.deleteMany({_id:{$in:linked.map(e=>e._id)},patient:p._id,clinic:clinicId,enrolledBy:userId},{session});
    assert.equal(removed.deletedCount,linked.length);
     assert.equal((await Patient.deleteOne({_id:p._id,ownerUserId:null,nom:f.last,prenom:f.first,healthInsuranceNumberSearch:f.insurance},{session})).deletedCount,1);
    });}finally{await session.endSession();}
   }
   assert.deepEqual(await byFixture(f),[]);
  }
 }finally{
  if(JSON.stringify(current)!==JSON.stringify(original)){assert.deepEqual(current,temporary);await set(temporary,original);}
  const restored=await AdminUser.findOne(scoped,{assignedClinics:1}).lean();
  assert.deepEqual(restored?.assignedClinics.map(String),original);
 }
 assert.deepEqual((await byEntry()).map(e=>String(e._id)),state.baseEntryIds);
 console.log(JSON.stringify({fixturesRemoved:true,assignmentsRestored:true}));
}else throw Error('Action');
}finally{await mongoose.disconnect();}
