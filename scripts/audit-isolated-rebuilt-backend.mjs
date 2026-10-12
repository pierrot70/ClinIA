// Execute in the rebuilt image sharing only the network-none Mongo namespace.
// No environment URI, production key, index creation or document output.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
const require = createRequire(import.meta.url);
try {
    const expected = process.argv[1];
    const revision = JSON.parse(fs.readFileSync('/app/build-revision.json', 'utf8'));
    if (!/^[a-f0-9]{40}$/.test(expected) || revision.commit !== expected) throw new Error('revision_mismatch');
    const versions = {
        node: process.versions.node,
        nodemailer: require('/app/node_modules/nodemailer/package.json').version,
        proxyAddr: require('/app/node_modules/proxy-addr/package.json').version,
    };
    if (versions.node.split('.')[0] !== '24' || versions.nodemailer !== '10.0.14' || versions.proxyAddr !== '2.0.8') {
        throw new Error('dependency_mismatch');
    }
    mongoose.set('autoIndex', false);
    mongoose.set('autoCreate', false);
    await mongoose.connect('mongodb://127.0.0.1:27017/clinia_restore_test?directConnection=true&replicaSet=restore_test', {
        autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000,
    });
    const db = mongoose.connection.db;
    async function snapshot() {
        const collections = await db.listCollections({}, { nameOnly: false }).toArray();
        collections.sort((a, b) => a.name.localeCompare(b.name));
        const result = [];
        for (const collection of collections) {
            if (collection.type === 'view') continue;
            result.push({ name: collection.name,
                count: await db.collection(collection.name).countDocuments(),
                indexes: (await db.collection(collection.name).indexes()).sort((a, b) => a.name.localeCompare(b.name)),
            });
        }
        return JSON.stringify(result);
    }
    const before = await snapshot();
    const { auditMongoIndexes } = await import('/app/scripts/migrations/auditMongoIndexes.js');
    const audit = await auditMongoIndexes({ db });
    if (audit.errors || audit.checkedCollections < 3) throw new Error('model_index_audit_failed');
    if (before !== await snapshot()) throw new Error('restore_modified_by_audit');
    console.log('BUILD_REVISION_OK ' + revision.commit);
    console.log('RUNTIME_VERSIONS ' + JSON.stringify(versions));
    console.log('MODEL_INDEX_AUDIT_OK ' + JSON.stringify(audit));
    console.log('PRE_APPLICATION_METADATA_UNCHANGED_OK');
} catch (_) {
    console.error('REBUILT_BACKEND_AUDIT_FAILED details_suppressed');
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
