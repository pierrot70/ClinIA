import "dotenv/config";
import mongoose from "mongoose";
import OpenAI from "openai";

import { UiTranslationCache } from "../../models/UiTranslationCache.js";
import { createApprovedUiTranslationSeeder } from "../../services/approvedUiTranslationSeeder.js";
import { APPROVED_UI_TRANSLATION_CATALOG } from "./approvedUiTranslationCatalog.js";

const ALLOWED_TARGET_LANGUAGES = new Set([
    "fr",
    "fr-CA",
    "en",
    "en-CA",
    "es",
    "ko-KR",
    "vi",
    "no-NO",
    "ja",
    "zh",
    "he",
]);
const CONFIRMATION = "SEED_APPROVED_UI_TRANSLATIONS";

function fail(message) {
    throw new Error(message);
}

function parseArguments(argv) {
    const options = { dryRun: false, apply: false, targetLang: null };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--dry-run") {
            options.dryRun = true;
            continue;
        }
        if (argument === "--apply") {
            options.apply = true;
            continue;
        }
        if (argument === "--target-lang") {
            options.targetLang = argv[index + 1] || null;
            index += 1;
            continue;
        }
        fail(`unknown_argument value=${argument}`);
    }

    if (options.dryRun === options.apply) {
        fail("choose_exactly_one_mode --dry-run|--apply");
    }
    if (!ALLOWED_TARGET_LANGUAGES.has(options.targetLang)) {
        fail("invalid_target_lang use_an_interface_language");
    }
    return options;
}

function createOpenAiTranslator() {
    if (!process.env.OPENAI_API_KEY) fail("missing_OPENAI_API_KEY");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    return async ({ sourceText, targetLang }) => {
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "Translate this approved ClinIA UI label. Return only the translated label and preserve placeholders and punctuation.",
                },
                {
                    role: "user",
                    content: `Target language: ${targetLang}\nApproved UI label: ${sourceText}`,
                },
            ],
            temperature: 0,
            max_tokens: 256,
        });

        return completion.choices[0]?.message?.content?.trim() || "";
    };
}

async function run() {
    const options = parseArguments(process.argv.slice(2));
    if (!process.env.MONGO_URI) fail("missing_MONGO_URI");
    if (
        options.apply &&
        process.env.CONFIRM_UI_TRANSLATION_SEED !== CONFIRMATION
    ) {
        fail(`missing_confirmation set CONFIRM_UI_TRANSLATION_SEED=${CONFIRMATION}`);
    }

    await mongoose.connect(process.env.MONGO_URI);
    try {
        const seed = createApprovedUiTranslationSeeder({
            UiTranslationCache,
            catalog: APPROVED_UI_TRANSLATION_CATALOG,
            translate: options.dryRun
                ? async () => fail("dry_run_must_not_translate")
                : createOpenAiTranslator(),
        });
        const report = await seed({
            targetLang: options.targetLang,
            dryRun: options.dryRun,
        });
        console.log(
            `COMPLETE mode=${options.dryRun ? "dry-run" : "apply"} target_lang=${options.targetLang} pending=${report.pending} created=${report.created} skipped=${report.skipped}`
        );
    } finally {
        await mongoose.disconnect();
    }
}

run().catch((error) => {
    console.error(`ERROR ${error.message}`);
    process.exitCode = 1;
});
