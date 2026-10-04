import {beforeAll, beforeEach, afterEach, afterAll, it, expect, vi} from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {LoginFailureThrottle} from '../models/LoginFailureThrottle.js';
import {AdminUser} from '../models/AdminUser.js';
import {recordLoginFailure, getLoginFailureThrottle, clearLoginFailureThrottle, hashLoginFailureIp, LOGIN_FAILURE_DELAYS_MS} from '../services/auth/loginFailureThrottle.js';
import {login} from '../services/auth.js';
import {createSecurityIncident} from '../services/securityIncidents.js';
vi.mock('../audit/authAudit.js', () => ({recordAuthAuditEvent: vi.fn().mockResolvedValue(undefined)}));
vi.mock('../services/securityIncidents.js', () => ({createSecurityIncident: vi.fn().mockResolvedValue(undefined)}));
let owned = false, userId;
const ip = '127.0.0.1';
let now;
beforeAll(async () => {
    const uri = process.env.CLINIA_WALKIN_TEST_URI || '';
    if (process.env.NODE_ENV !== 'test' || !/^mongodb:\/\/127\.0\.0\.1:\d+\/clinia_walkin_integration\?directConnection=true&replicaSet=walkin_test$/.test(uri)) throw new Error('Disposable local runner required');
    await mongoose.connect(uri, {autoCreate:false, autoIndex:false});
    expect((await mongoose.connection.db.admin().command({hello:1})).setName).toBe('walkin_test');
    expect(await mongoose.connection.db.listCollections().toArray()).toHaveLength(0);
    owned = true;
    for (const model of Object.values(mongoose.models)) {await model.createCollection(); await model.createIndexes();}
});
beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    userId = new mongoose.Types.ObjectId(); now = new Date();
    vi.mocked(createSecurityIncident).mockClear();
});
afterEach(() => {vi.restoreAllMocks();});
afterAll(async () => {if (owned) await mongoose.connection.dropDatabase(); await mongoose.disconnect();});
function synchronizedReads(count) {
    const original = LoginFailureThrottle.findOne.bind(LoginFailureThrottle);
    let arrivals=0, release;
    const gate = new Promise(resolve => {release=resolve;});
    vi.spyOn(LoginFailureThrottle, 'findOne').mockImplementation(async (...args) => {
        const doc = await original(...args);
        if (arrivals < count) {arrivals++; if (arrivals===count) release(); await gate;}
        return doc;
    });
}
const fail = (at=now, source=ip, id=userId) => recordLoginFailure({userId:id, ip:source, now:at});
it.each([false,true])('counts a concurrent burst with existing record=%s without losing the block', async seeded => {
    if (seeded) await LoginFailureThrottle.create({userId, ipHash:hashLoginFailureIp(ip), expiresAt:new Date(now.getTime()+86400000)});
    synchronizedReads(20);
    const results=await Promise.all(Array.from({length:20},()=>fail()));
    expect(results.filter(x=>!x.blocked)).toHaveLength(4);
    expect(results.filter(x=>x.newlyBlocked)).toHaveLength(1);
    expect(results.filter(x=>x.shouldCreateIncident)).toHaveLength(1);
    expect(await LoginFailureThrottle.countDocuments({userId})).toBe(1);
    const doc=await LoginFailureThrottle.findOne({userId});
    expect(doc.failureCount).toBe(0); expect(doc.penaltyLevel).toBe(1);
    expect(doc.blockedUntil).toEqual(new Date(now.getTime()+60000));
});
it('preserves every failure below the threshold', async () => {
    synchronizedReads(4);
    const results=await Promise.all(Array.from({length:4},()=>fail()));
    expect(results.every(x=>!x.blocked)).toBe(true);
    expect((await LoginFailureThrottle.findOne({userId})).failureCount).toBe(4);
});
it('keeps progressive cooldowns stable under concurrent bursts and caps incident levels', async () => {
    let at=now;
    for (let level=1;level<=4;level++) {
        const results=await Promise.all(Array.from({length:20},()=>fail(at)));
        expect(results.filter(x=>x.newlyBlocked)).toHaveLength(1);
        expect(results.filter(x=>x.shouldCreateIncident)).toHaveLength(level<=3?1:0);
        const before=await LoginFailureThrottle.findOne({userId}).lean();
        expect(before.penaltyLevel).toBe(Math.min(level,3));
        expect(before.blockedUntil).toEqual(new Date(at.getTime()+LOGIN_FAILURE_DELAYS_MS[Math.min(level,3)-1]));
        await Promise.all(Array.from({length:10},()=>fail(new Date(at.getTime()+1000))));
        const after=await LoginFailureThrottle.findOne({userId}).lean();
        expect(after.blockedUntil).toEqual(before.blockedUntil);
        expect(after.expiresAt).toEqual(before.expiresAt);
        at = before.blockedUntil; // The exact boundary ends the cooldown.
    }
});
it('isolates accounts and sources and restarts after a successful-login clear', async () => {
    await Promise.all(Array.from({length:10},()=>fail()));
    expect((await getLoginFailureThrottle({userId,ip,now})).blocked).toBe(true);
    expect((await getLoginFailureThrottle({userId,ip:'127.0.0.2',now})).blocked).toBe(false);
    expect((await getLoginFailureThrottle({userId:new mongoose.Types.ObjectId(),ip,now})).blocked).toBe(false);
    await clearLoginFailureThrottle({userId,ip});
    expect((await fail()).blocked).toBe(false);
    expect((await LoginFailureThrottle.findOne({userId})).failureCount).toBe(1);
});
it('applies the block through real password verification and emits one incident', async () => {
    await AdminUser.create({_id:userId,username:'synthetic-throttle',email:'synthetic-throttle@example.invalid',role:'USER',passwordHash:await bcrypt.hash('Synthetic-correct-2026!',4)});
    synchronizedReads(20);
    const results=await Promise.allSettled(Array.from({length:20},()=>login({username:'synthetic-throttle',password:'Synthetic-wrong-2026!',req:{ip,headers:{}}})));
    expect(results.every(x=>x.status==='rejected' && ['INVALID_CREDENTIALS','LOGIN_THROTTLED'].includes(x.reason.code))).toBe(true);
    expect((await getLoginFailureThrottle({userId,ip})).blocked).toBe(true);
    expect(createSecurityIncident).toHaveBeenCalledTimes(1);
});
it('resets expired history even before MongoDB TTL deletion, with a concurrent burst', async () => {
    const expiredAt=new Date(now.getTime()+60000);
    await LoginFailureThrottle.create({userId,ipHash:hashLoginFailureIp(ip),failureCount:4,penaltyLevel:3,lastIncidentPenaltyLevel:3,expiresAt:expiredAt,blockedUntil:new Date(now.getTime()+180000)});
    const at = new Date(expiredAt.getTime()+1);
    expect((await getLoginFailureThrottle({userId,ip,now:at})).blocked).toBe(false);
    synchronizedReads(20);
    const results=await Promise.all(Array.from({length:20},()=>fail(at)));
    expect(results.filter(x=>x.newlyBlocked)).toHaveLength(1);
    expect(results.filter(x=>x.shouldCreateIncident)).toHaveLength(1);
    expect((await LoginFailureThrottle.findOne({userId})).penaltyLevel).toBe(1);
});
it('does not overwrite a new counter after clear races with an old snapshot', async () => {
    await fail();
    const original=LoginFailureThrottle.findOneAndUpdate.bind(LoginFailureThrottle);
    let enter, release;
    const entered=new Promise(resolve=>{enter=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    vi.spyOn(LoginFailureThrottle,'findOneAndUpdate').mockImplementationOnce(async (...args)=>{
        enter(); await gate; return original(...args);
    });
    const pending=fail();
    await entered;
    try {await clearLoginFailureThrottle({userId,ip}); await fail();}
    finally {release();}
    await pending;
    expect((await LoginFailureThrottle.findOne({userId})).failureCount).toBe(2);
});
