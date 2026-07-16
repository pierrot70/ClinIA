import crypto from "node:crypto";

const WRITE_CONCERN = { w: "majority", j: true, wtimeout: 5000 };

function makeSourceHash(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
}

async function resolveQuery(query) {
    return typeof query?.lean === "function" ? query.lean() : query;
}

export function createApprovedUiTranslationSeeder({
    UiTranslationCache,
    catalog,
    translate,
    logger = console,
}) {
    return async function seedApprovedUiTranslations({ targetLang, dryRun }) {
        const seen = new Set();
        const report = { pending: 0, created: 0, skipped: 0 };

        for (const entry of catalog) {
            const sourceHash = makeSourceHash(entry.text);
            const cacheKey = `${entry.namespace}:${targetLang}:${sourceHash}`;
            if (seen.has(cacheKey)) {
                throw new Error(`duplicate_approved_translation_source key=${cacheKey}`);
            }
            seen.add(cacheKey);

            const existing = await resolveQuery(
                UiTranslationCache.findOne({
                    namespace: entry.namespace,
                    sourceLocale: "fr",
                    targetLang,
                    sourceHash,
                })
            );
            if (existing) {
                report.skipped += 1;
                logger.log(`SKIP namespace=${entry.namespace} source_hash=${sourceHash.slice(0, 12)}`);
                continue;
            }

            if (dryRun) {
                report.pending += 1;
                logger.log(`PENDING namespace=${entry.namespace} source_hash=${sourceHash.slice(0, 12)}`);
                continue;
            }

            const translated = await translate({
                sourceText: entry.text,
                targetLang,
            });
            if (typeof translated !== "string" || !translated.trim()) {
                throw new Error(`empty_approved_translation namespace=${entry.namespace}`);
            }

            try {
                await UiTranslationCache.create(
                    [
                        {
                            namespace: entry.namespace,
                            sourceLocale: "fr",
                            targetLang,
                            sourceHash,
                            payload: { text: translated.trim() },
                            model: "gpt-4.1-mini",
                        },
                    ],
                    { writeConcern: WRITE_CONCERN }
                );
            } catch (error) {
                if (error?.code === 11000) {
                    report.skipped += 1;
                    logger.log(`SKIP namespace=${entry.namespace} source_hash=${sourceHash.slice(0, 12)} reason=already_created`);
                    continue;
                }
                throw error;
            }
            report.created += 1;
            logger.log(`CREATED namespace=${entry.namespace} source_hash=${sourceHash.slice(0, 12)}`);
        }

        return report;
    };
}
