import compiled from "./compiledUiTranslations.json";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { enFallback } from "./enFallback";
import { esFallback } from "./esFallback";
import { heFallback } from "./heFallback";
import { getPatientPageFallback } from "./patientPageFallbacks";
import { getSupportInboxFallback } from "./supportAccessInboxLabels";
import { getCommentsPageFallback } from "./commentsPageLabels";
import { getReceiptLabelFallback } from "./myWriteReceiptsLabels";
import { getAppointmentCreationFallback } from "./appointmentCreationLabels";
import { localizeAuthUiLabel } from "./authUiLabels";
import { baseUiLocale, validUiTranslation } from "./uiLocales";
import { clinicalReviewLabels } from "./clinicalReviewLabels";
import { clinicalSafetyLabels } from "./clinicalSafetyLabels";
import { analysisStatusLabels } from "./analysisStatusLabels";
import { passwordPolicyLabels } from "./passwordPolicyLabels";
import { getClinicalFormReviewedStrings } from "./clinicalFormStrings";
import { getClinicalResultStrings } from "./clinicalResultStrings";
import { getCachedResultNoticeLabels } from "./cachedResultNoticeLabels";
import { consultationLabels } from "./consultationLabels";
import { urgentologistTranslations } from "./urgentologistLabels";
import { receptionReplanLabels } from "./receptionReplanLabels";
import { validationReportLabels } from "./validationReportLabels";
import { getQuickModeHeader } from "./quickModeLabels";
import { getPatientSummaryHeader } from "./patientSummaryExample";
import { appointmentListLabel } from "./appointmentListLabels";
import { receptionLabel } from "./receptionLabels";
import { localizePageUiLabel } from "./pageUiLabels";
import { localizeAdminUiLabel } from "./adminUiLabels";
import { localizeCoreUiLabel } from "./coreUiLabels";
import { localizeClinicalUiLabel } from "./clinicalUiLabels";
import { localizeComponentUiLabel } from "./componentUiLabels";
import { localizeHeaderUiLabel } from "./headerUiLabels";
import { localizeSecurityUiLabel } from "./securityUiLabels";
import { localizeClinicalDemoUiLabel } from "./clinicalDemoUiLabels";
import { localizeExampleUiLabel } from "./exampleUiLabels";
import { localizeSchedulingUiLabel } from "./schedulingUiLabels";
import { localizeResidualUiLabel } from "./residualUiLabels";
import { localizeMiscUiLabel } from "./miscUiLabels";
import { localizeVoiceUiLabel } from "./voiceUiLabels";
import { walkInEmergencyReminder } from "./urgentologistLabels";

type Tree = { [key: string]: unknown };
const localTrees = new Map<string, Map<string, string>>();

function pairTrees(source: unknown, translated: unknown, into: Map<string, string>) {
    if (typeof source === "string") {
        if (validUiTranslation(source, translated)) into.set(source, translated);
        return;
    }
    if (!source || typeof source !== "object" || !translated || typeof translated !== "object") return;
    for (const [key, value] of Object.entries(source)) pairTrees(value, (translated as Tree)[key], into);
}

function indexedLabels(locale: string) {
    let result = localTrees.get(locale);
    if (result) return result;
    result = new Map();
    for (const getTree of [getClinicalFormReviewedStrings, getClinicalResultStrings,
        getCachedResultNoticeLabels, getQuickModeHeader, getPatientSummaryHeader]) {
        pairTrees(getTree("fr-CA"), getTree(locale), result);
    }
    for (const [source, translated] of [
        [UI_LABELS_FR.clinicalReview, clinicalReviewLabels(locale)],
        [UI_LABELS_FR.clinicalSafety, clinicalSafetyLabels(locale)],
        [UI_LABELS_FR.analysisStatus, analysisStatusLabels(locale)],
        [UI_LABELS_FR.auth.passwordPolicy, passwordPolicyLabels(locale)],
        [UI_LABELS_FR.consultations, consultationLabels(locale)],
        [UI_LABELS_FR.urgentologist, urgentologistTranslations[baseUiLocale(locale)]],
        [UI_LABELS_FR.receptionReplan, receptionReplanLabels(locale)],
        [UI_LABELS_FR.validationReports, validationReportLabels(locale)],
    ]) pairTrees(source, translated, result);
    for (const source of [UI_LABELS_FR.appointmentsList, UI_LABELS_FR.walkInArrival, UI_LABELS_FR.receptionClinic]) {
        for (const [key, french] of Object.entries(source)) {
            if (typeof french !== "string") continue;
            const translated = source === UI_LABELS_FR.appointmentsList
                ? appointmentListLabel(locale, key, french) : receptionLabel(locale, key, french);
            if (translated !== french && validUiTranslation(french, translated)) result.set(french, translated);
        }
    }
    localTrees.set(locale, result);
    return result;
}

// Null is meaningful: the audit must see missing translations rather than
// mistaking a French/English fallback for the requested language.
function resolveSourceLabel(source: string, locale: string, key?: string): string | null {
    const language = baseUiLocale(locale);
    if (language === "fr") return source;
    // Symbols, opaque role identifiers and units have no linguistic content.
    if (!/[\p{L}]/u.test(source.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, ""))
        || /^(?:[A-Z][A-Z0-9_]*|kg|cm|mg|mmHg|bpm|ms|s|min|h|lag|Transport|ClinIA)$/.test(source)) return source;
    if (source === UI_LABELS_FR.header.aiMode.mock || source === UI_LABELS_FR.header.aiMode.real) return source;
    const security = localizeSecurityUiLabel(source, language);
    if (security) return security;
    const auth = localizeAuthUiLabel(source, language);
    if (auth) return auth;
    const core = localizeCoreUiLabel(source, language);
    if (core) return core;
    const residual = localizeResidualUiLabel(source, language);
    if (residual) return residual;
    const misc = localizeMiscUiLabel(source, language);
    if (misc) return misc;
    const voice = localizeVoiceUiLabel(source, language);
    if (voice) return voice;
    if (language === "en" && source === UI_LABELS_FR.app.landing.doctorLoginTitle) return "Doctor sign-in";
    // Existing page dictionaries are the authoritative translations for these
    // sources. Generic component dictionaries can contain the same French word
    // in a different context (for example a patient's last name).
    for (const helper of [getAppointmentCreationFallback, getReceiptLabelFallback,
        getCommentsPageFallback, getSupportInboxFallback, getPatientPageFallback]) {
        const translated = helper(source, language);
        if (translated && validUiTranslation(source, translated)) return translated;
    }
    const header = localizeHeaderUiLabel(source, language);
    if (header) return header;
    const component = localizeComponentUiLabel(source, language);
    if (component) return component;
    const clinical = localizeClinicalUiLabel(source, language);
    if (clinical) return clinical;
    const demo = localizeClinicalDemoUiLabel(source, language);
    if (demo) return demo;
    const example = localizeExampleUiLabel(source, language);
    if (example) return example;
    const scheduling = localizeSchedulingUiLabel(source, language);
    if (scheduling) return scheduling;
    if (source === UI_LABELS_FR.walkInEmergencyReminder) return walkInEmergencyReminder.text;
    const page = localizePageUiLabel(source, language, true);
    if (page) return page;
    const admin = localizeAdminUiLabel(source, language);
    if (admin) return admin;
    const treeValue = indexedLabels(language).get(source);
    if (treeValue) return treeValue;
    const bundle = compiled as {
        byKey: Record<string, { source: string; translations: Record<string, string> }>;
        bySource: Record<string, Record<string, string>>;
    };
    const entry = key ? bundle.byKey[key] : undefined;
    const keyed = entry?.source === source ? entry.translations[language] : undefined;
    const translated = ({ en: enFallback, es: esFallback, he: heFallback } as Record<string, Record<string, string>>)[language]?.[source]
        ?? keyed ?? bundle.bySource[source]?.[language];
    return validUiTranslation(source, translated) ? translated : null;
}

function staticSources(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    return Object.values(value).flatMap(staticSources);
}
const sourceLabels = new Set(staticSources(UI_LABELS_FR));
let reverseLabels: Map<string, string | null> | null = null;
function canonicalSource(text: string) {
    if (sourceLabels.has(text)) return text;
    if (!reverseLabels) {
        reverseLabels = new Map();
        for (const source of sourceLabels) {
            for (const locale of ["en", "es", "ko", "vi", "no", "ja", "zh", "he"]) {
                const translated = resolveSourceLabel(source, locale);
                if (!translated || translated === source) continue;
                if (reverseLabels.has(translated) && reverseLabels.get(translated) !== source) reverseLabels.set(translated, null);
                else reverseLabels.set(translated, source);
            }
        }
    }
    return reverseLabels.get(text) ?? text;
}

export function getLocalUiTranslation(source: string, locale: string, key?: string): string | null {
    return resolveSourceLabel(canonicalSource(source), locale, key);
}

export function localizeUiLabel(source: string, locale: string) {
    return getLocalUiTranslation(source, locale) ?? source;
}

// Server prose is never translated remotely. Only known interface labels (or
// their named-parameter templates) may be rendered as a localized message.
export function getLocalUiMessage(message: string, locale: string): string | null {
    const source = canonicalSource(message);
    if (sourceLabels.has(source)) return resolveSourceLabel(source, locale);
    for (const template of sourceLabels) {
        if (!/\{[A-Za-z_][A-Za-z0-9_]*\}/.test(template)) continue;
        // A fragment such as "{scope} sur {date}" can match unrelated server
        // prose. Message templates need sufficient fixed wording to identify
        // their context; short count fragments are rendered through UiText.
        if (template.replace(/\{[^}]+\}/g, "").replace(/[^\p{L}]/gu, "").length < 12) continue;
        const names: string[] = [];
        const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\\\{([A-Za-z_][A-Za-z0-9_]*)\\\}/g, (_, name: string) => {
                names.push(name);
                return "(.+?)";
            });
        const match = new RegExp(`^${escaped}$`, "s").exec(message);
        if (!match) continue;
        const translation = resolveSourceLabel(template, locale);
        if (!translation) return null;
        const values = Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
        return translation.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name: string) => values[name] ?? token);
    }
    return null;
}
