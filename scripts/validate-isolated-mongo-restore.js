// Run with mongosh, before any application connects to the restored database.
// Output contains collection/index metadata only, never document contents.
try {
    if (db.adminCommand({ getParameter: 1, ttlMonitorEnabled: 1 }).ttlMonitorEnabled !== false) {
        throw new Error('ttl_monitor_not_disabled');
    }
    const target = db.getSiblingDB('clinia_restore_test');
    const infos = target.getCollectionInfos().sort((a, b) => a.name.localeCompare(b.name));
    if (!infos.length) throw new Error('empty_restore');
    const collections = [];
    for (const info of infos) {
        if (info.type === 'view') {
            collections.push({ name: info.name, type: 'view' });
            continue;
        }
        const collection = target.getCollection(info.name);
        const validation = collection.validate({ full: true });
        if (validation.ok !== 1 || validation.valid !== true) throw new Error('collection_validation_failed');
        collections.push({
            name: info.name,
            type: info.type,
            documentCount: collection.countDocuments(),
            valid: true,
            indexes: collection.getIndexes(),
        });
    }
    const expected = [
        ['patients', 'owner_health_insurance_number_unique_idx',
            { ownerUserId: 1, country: 1, healthInsuranceJurisdiction: 1, healthInsuranceNumberSearch: 1 },
            { healthInsuranceNumberSearch: { $type: 'string' } }],
        ['appointments', 'patient_date_time_scheduled_unique',
            { patient: 1, date: 1, time: 1 }, { status: 'scheduled' }],
        ['appointmentbookingguards', 'patient_specialist_day_unique',
            { patient: 1, specialist: 1, date: 1 }, undefined],
    ];
    function canonical(value) {
        if (Array.isArray(value)) {
            const result = [];
            for (const item of value) result.push(canonical(item));
            return result;
        }
        if (value && typeof value === 'object') {
            const result = {};
            for (const key of Object.keys(value).sort()) result[key] = canonical(value[key]);
            return result;
        }
        return value;
    }
    const criticalIndexes = [];
    for (const [name, indexName, key, partial] of expected) {
        let index;
        for (const collection of collections) {
            if (collection.name === name) {
                for (const candidate of collection.indexes || []) {
                    if (candidate.name === indexName) index = candidate;
                }
            }
        }
        // Compound key order is significant; order of partial-expression fields is not.
        const ok = index?.unique === true
            && JSON.stringify(Object.entries(index.key)) === JSON.stringify(Object.entries(key))
            && JSON.stringify(canonical(index.partialFilterExpression)) === JSON.stringify(canonical(partial))
            && !index.sparse && !index.hidden;
        if (!ok) throw new Error('critical_index_missing_or_mismatched');
        criticalIndexes.push({ collection: name, name: indexName, status: 'OK' });
    }
    let documentCount = 0;
    for (const collection of collections) documentCount += collection.documentCount || 0;
    print(JSON.stringify({
        status: 'OK', database: 'clinia_restore_test',
        mongoVersion: db.version(), ttlMonitorEnabled: false,
        collectionCount: collections.length,
        documentCount,
        criticalIndexes, collections,
    }));
} catch (_) {
    print('RESTORE_VALIDATION_FAILED details_suppressed');
    quit(1);
}
