// Executed with node --eval in the deployed backend. stdin contains only a
// private credential JSON object piped directly from Docker inspect through jq.
import fs from 'node:fs';
import mongoose from 'mongoose';
try {
    const { username, password } = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
        throw new Error('missing_credentials');
    }
    await mongoose.connect(process.env.MONGO_URI, {
        user: username, pass: password, authSource: 'admin',
        autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000,
    });
    const status = await mongoose.connection.db.admin().command({ replSetGetStatus: 1, maxTimeMS: 10000 });
    const members = status.members;
    const primary = members.filter(member => member.stateStr === 'PRIMARY' && member.health === 1).length;
    const secondary = members.filter(member => member.stateStr === 'SECONDARY' && member.health === 1).length;
    const times = members.map(member => member.optimeDate ? new Date(member.optimeDate).getTime() : NaN);
    const lag = times.every(Number.isFinite) ? (Math.max(...times) - Math.min(...times)) / 1000 : null;
    console.log(JSON.stringify({ primary, secondary, members: members.length, lagSeconds: lag }));
    if (status.ok !== 1 || members.length !== 3 || primary !== 1 || secondary !== 2 || lag === null || lag > 10) process.exitCode = 1;
} catch (error) {
    console.log('MONGO_STATUS_FAILED code=' + (Number.isInteger(error.code) ? error.code : 'unavailable') + ' details_suppressed');
    process.exitCode = 1;
} finally { await mongoose.disconnect(); }
