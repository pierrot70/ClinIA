function stableValue(value) {
    if (Array.isArray(value)) {
        return value.map(stableValue);
    }

    if (value && typeof value === "object") {
        return Object.keys(value)
            .sort()
            .reduce((normalized, key) => {
                normalized[key] = stableValue(value[key]);
                return normalized;
            }, {});
    }

    return value;
}

function normalizedKey(key = {}) {
    return Object.entries(key);
}

function sameJson(left, right) {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function sameKey(left, right) {
    return sameJson(normalizedKey(left), normalizedKey(right));
}

export function comparableIndex(index = {}) {
    return {
        key: normalizedKey(index.key),
        unique: index.unique === true,
        sparse: index.sparse === true,
        expireAfterSeconds:
            index.expireAfterSeconds === undefined
                ? null
                : index.expireAfterSeconds,
        partialFilterExpression: index.partialFilterExpression || null,
        collation: index.collation || null,
    };
}

function sameIndexOptions(expected, actual) {
    const expectedComparable = comparableIndex(expected);
    const actualComparable = comparableIndex(actual);

    return (
        expectedComparable.unique === actualComparable.unique &&
        expectedComparable.sparse === actualComparable.sparse &&
        expectedComparable.expireAfterSeconds ===
            actualComparable.expireAfterSeconds &&
        sameJson(
            expectedComparable.partialFilterExpression,
            actualComparable.partialFilterExpression
        ) &&
        sameJson(expectedComparable.collation, actualComparable.collation)
    );
}

function expectedIndexDefinition([key, options = {}]) {
    return {
        key,
        ...options,
    };
}

export function auditCollectionIndexes({ expectedIndexes, actualIndexes }) {
    const expected = expectedIndexes.map(expectedIndexDefinition);
    const actual = actualIndexes.filter((index) => index.name !== "_id_");
    const matchedActualIndexes = new Set();
    const missing = [];
    const mismatched = [];

    for (const expectedIndex of expected) {
        const candidates = actual
            .map((index, position) => ({ index, position }))
            .filter(({ index }) => sameKey(expectedIndex.key, index.key));
        const matchingCandidate = candidates.find(({ index }) =>
            sameIndexOptions(expectedIndex, index)
        );

        if (matchingCandidate) {
            matchedActualIndexes.add(matchingCandidate.position);
            continue;
        }

        const conflictingCandidate = candidates[0];
        if (conflictingCandidate) {
            matchedActualIndexes.add(conflictingCandidate.position);
            mismatched.push({
                key: expectedIndex.key,
                expected: comparableIndex(expectedIndex),
                actual: comparableIndex(conflictingCandidate.index),
            });
            continue;
        }

        missing.push({
            key: expectedIndex.key,
            expected: comparableIndex(expectedIndex),
        });
    }

    const extra = actual
        .map((index, position) => ({ index, position }))
        .filter(({ position }) => !matchedActualIndexes.has(position))
        .map(({ index }) => ({
            name: index.name,
            actual: comparableIndex(index),
        }));

    return { missing, mismatched, extra };
}

export function hasIndexAuditErrors(result) {
    return result.missing.length > 0 || result.mismatched.length > 0;
}
