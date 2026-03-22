import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  HOME_STRINGS_EN,
  HOME_STRINGS_ES,
  HOME_STRINGS_FR,
  HOME_STRINGS_HE,
  HOME_STRINGS_JA,
  HOME_STRINGS_KO,
  HOME_STRINGS_VI,
  HOME_STRINGS_ZH,
  type HomeStrings,
} from "../i18n/homeStrings";
import { translateHomeStrings } from "../services/i18nApi";

type Locale = string;

type VoicePromptPayload = {
  voiceAck: string;
  dictationInstruction: string;
};

type HomeI18nContextValue = {
  locale: Locale;
  strings: HomeStrings;
  isTranslating: boolean;
  setLocaleFromDropdown: (target: Locale) => Promise<void>;
  setLocaleFromVoice: (target: Locale) => Promise<VoicePromptPayload>;
};

export const HomeI18nContext = createContext<HomeI18nContextValue | null>(null);
const UI_LOCALE_STORAGE_KEY = "clinia_ui_locale_v1";

const SUPPORTED_UI_LOCALES = [
  "fr-CA",
  "en-CA",
  "ja",
  "zh",
  "he",
  "es",
  "ko-KR",
  "vi",
] as const;
type SupportedUiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

const toSupportedUiLocale = (value: string): SupportedUiLocale => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "en-CA";
  }

  if (normalized.startsWith("fr")) return "fr-CA";
  if (normalized.startsWith("en")) return "en-CA";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("he") || normalized.startsWith("iw")) return "he";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("ko")) return "ko-KR";
  if (normalized.startsWith("vi")) return "vi";
  return "en-CA";
};

const toBaseLang = (value: string) => toSupportedUiLocale(value).toLowerCase().slice(0, 2);

const detectBrowserUiLocale = (): SupportedUiLocale => {
  if (typeof navigator === "undefined") {
    return "en-CA";
  }

  const candidates = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  for (const candidate of candidates) {
    const mapped = toSupportedUiLocale(candidate);
    if (mapped) {
      return mapped;
    }
  }

  return "en-CA";
};

const cacheKeyForLocale = (locale: string) =>
  `clinia_home_i18n_${locale}_v1`;

const VOICE_ACK_LABELS: Record<string, string> = {
  en: "english",
  es: "spanish",
  de: "german",
  it: "italian",
  pt: "portuguese",
  ja: "japanese",
  ko: "korean",
  zh: "chinese",
  vi: "vietnamese",
  ar: "arabic",
  ru: "russian",
};

const buildVoiceAck = (localeCode: string) => {
  const normalized = (localeCode || "fr").toLowerCase().slice(0, 2);
  if (normalized === "fr") {
    return "Retour en francais.";
  }

  const label = VOICE_ACK_LABELS[normalized] || normalized;
  return `Back in ${label}.`;
};

const DICTATION_PROMPT_BY_LANG: Record<string, string> = {
  fr: "Dites ou ecrivez votre diagnostic.",
  en: "Please dictate or type your diagnosis.",
  es: "Por favor, dicte o escriba su diagnostico.",
  de: "Bitte diktieren oder schreiben Sie Ihre Diagnose.",
  it: "Per favore, detti o scriva la sua diagnosi.",
  pt: "Por favor, dite ou escreva seu diagnostico.",
  ja: "音声で診断を入力するか、テキストで入力してください。",
  ko: "진단 내용을 음성으로 말하거나 텍스트로 입력해 주세요.",
  vi: "Vui long doc hoac nhap chan doan cua ban.",
  zh: "Qing koushu huo shuru nin de zhenduan.",
  he: "נא להכתיב או להקליד את האבחנה שלך.",
};

const buildDictationPrompt = (localeCode: string) => {
  const normalized = (localeCode || "fr").toLowerCase().slice(0, 2);
  return DICTATION_PROMPT_BY_LANG[normalized] || DICTATION_PROMPT_BY_LANG.en;
};

const LOCAL_HOME_STRINGS_BY_BASE: Record<string, HomeStrings> = {
  fr: HOME_STRINGS_FR,
  en: HOME_STRINGS_EN,
  ja: HOME_STRINGS_JA,
  zh: HOME_STRINGS_ZH,
  he: HOME_STRINGS_HE,
  es: HOME_STRINGS_ES,
  ko: HOME_STRINGS_KO,
  vi: HOME_STRINGS_VI,
};

const getLocalHomeStrings = (baseLang: string): HomeStrings =>
  LOCAL_HOME_STRINGS_BY_BASE[baseLang] || HOME_STRINGS_EN;

const LOCAL_SCRIPT_LOCK_LANGS = new Set(["he", "ja", "ko"]);

export const HomeI18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocaleState] = useState<Locale>("en-CA");
  const [strings, setStrings] = useState<HomeStrings>(HOME_STRINGS_EN);
  const [isTranslating, setIsTranslating] = useState(false);

  const setLocaleFromVoice = useCallback(async (target: Locale) => {
    const normalizedTarget = toSupportedUiLocale(target);
    const targetBase = toBaseLang(normalizedTarget);

    if (!normalizedTarget || targetBase === "fr") {
      setLocaleState("fr-CA");
      setStrings(HOME_STRINGS_FR);
      try {
        window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, "fr-CA");
      } catch (e) {}
      return {
        voiceAck: buildVoiceAck("fr"),
        dictationInstruction: buildDictationPrompt("fr"),
      };
    }

    // KISS: apply a local bundle immediately so UI updates without reload,
    // then refine with cache/API if available.
    setLocaleState(normalizedTarget);
    setStrings(getLocalHomeStrings(targetBase));
    try {
      window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, normalizedTarget);
    } catch (e) {}

    if (LOCAL_SCRIPT_LOCK_LANGS.has(targetBase)) {
      // Keep native-script bundles deterministic for these locales.
      try {
        window.localStorage.removeItem(cacheKeyForLocale(targetBase));
      } catch (e) {}
      return {
        voiceAck: buildVoiceAck(targetBase),
        dictationInstruction: buildDictationPrompt(targetBase),
      };
    }

    setIsTranslating(true);
    try {
      const cached = window.localStorage.getItem(
        cacheKeyForLocale(targetBase)
      );
      if (cached) {
        const parsed = JSON.parse(cached) as
          | HomeStrings
          | {
              strings: HomeStrings;
              resolvedLang?: string;
              voicePrompts?: {
                dictationInstruction?: string;
              };
            };

        const cachedStrings =
          (parsed as { strings?: HomeStrings }).strings ||
          (parsed as HomeStrings);

        const cachedPrompt =
          (parsed as { voicePrompts?: { dictationInstruction?: string } })
            ?.voicePrompts?.dictationInstruction;

        const cachedResolvedLang =
          (parsed as { resolvedLang?: string })?.resolvedLang;

        const cachedBase = (cachedResolvedLang || "").toLowerCase().slice(0, 2);
        const isFallbackEnglishUnderNonEnglishTarget =
          targetBase !== "en" &&
          JSON.stringify(cachedStrings) === JSON.stringify(HOME_STRINGS_EN);

        if (
          (cachedBase && cachedBase !== targetBase) ||
          isFallbackEnglishUnderNonEnglishTarget
        ) {
          window.localStorage.removeItem(cacheKeyForLocale(targetBase));
        } else {
          setStrings(cachedStrings);
          setLocaleState(normalizedTarget);
          try {
            window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, normalizedTarget);
          } catch (e) {}
          return {
            voiceAck: buildVoiceAck(targetBase),
            dictationInstruction:
              cachedPrompt || buildDictationPrompt(targetBase),
          };
        }
      }

      const translated = await translateHomeStrings(targetBase);

      const translatedBase = (translated.resolvedLang || "")
        .toLowerCase()
        .slice(0, 2);
      const isMismatchedTranslation =
        translatedBase.length > 0 && translatedBase !== targetBase;

      if (isMismatchedTranslation) {
        throw new Error("MISMATCHED_TRANSLATION_LOCALE");
      }

      setStrings(translated.strings);
      setLocaleState(normalizedTarget);
      window.localStorage.setItem(
        cacheKeyForLocale(targetBase),
        JSON.stringify({
          strings: translated.strings,
          resolvedLang: translated.resolvedLang || targetBase,
          voicePrompts: translated.voicePrompts,
        })
      );
      try {
        window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, normalizedTarget);
      } catch (e) {}
      return {
        voiceAck: translated.voiceAck || buildVoiceAck(targetBase),
        dictationInstruction:
          translated.voicePrompts?.dictationInstruction ||
          buildDictationPrompt(targetBase),
      };
    } catch (err) {
      // Keep the already-applied local bundle for the requested language.
      return {
        voiceAck: buildVoiceAck(targetBase),
        dictationInstruction: buildDictationPrompt(targetBase),
      };
    } finally {
      setIsTranslating(false);
    }
  }, []);

  const setLocaleFromDropdown = useCallback(
    async (target: Locale) => {
      await setLocaleFromVoice(target);
    },
    [setLocaleFromVoice]
  );

  useEffect(() => {
    let isMounted = true;

    const applyInitialLocale = async () => {
      let initialLocale: SupportedUiLocale | null = null;
      // 1. Try browser language
      try {
        const browserLocale = detectBrowserUiLocale();
        if (browserLocale) {
          initialLocale = browserLocale;
        }
      } catch (e) {
        initialLocale = null;
      }

      // 2. Try localStorage if browser language not found
      if (!initialLocale) {
        try {
          const stored = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);
          if (stored) {
            initialLocale = toSupportedUiLocale(stored);
          }
        } catch (e) {
          initialLocale = null;
        }
      }

      // 3. Fallback to English if neither found
      if (!initialLocale) {
        initialLocale = "en-CA";
      }

      if (!isMounted) return;
      if (toBaseLang(initialLocale) === "fr") {
        setLocaleState("fr-CA");
        setStrings(HOME_STRINGS_FR);
        try {
          window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, "fr-CA");
        } catch (e) {}
        return;
      }

      try {
        await setLocaleFromVoice(initialLocale);
      } catch (e) {
        // Fallback to English if all else fails
        setLocaleState("en-CA");
        setStrings(HOME_STRINGS_EN);
        try {
          window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, "en-CA");
        } catch (e) {}
      }
    };

    applyInitialLocale();

    return () => {
      isMounted = false;
    };
  }, [setLocaleFromVoice]);

  const value = useMemo<HomeI18nContextValue>(
    () => ({
      locale,
      strings,
      isTranslating,
      setLocaleFromDropdown,
      setLocaleFromVoice,
    }),
    [locale, strings, isTranslating, setLocaleFromDropdown, setLocaleFromVoice]
  );

  return (
    <HomeI18nContext.Provider value={value}>{children}</HomeI18nContext.Provider>
  );
};

export function useHomeI18n() {
  const ctx = useContext(HomeI18nContext);
  if (!ctx) {
    throw new Error("useHomeI18n must be used inside HomeI18nProvider");
  }
  return ctx;
}
