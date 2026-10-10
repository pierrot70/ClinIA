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
  HOME_STRINGS_NO,
  HOME_STRINGS_VI,
  HOME_STRINGS_ZH,
  type HomeStrings,
} from "../i18n/homeStrings";
import { UI_LOCALES, normalizeUiLocale } from "../i18n/uiLocales";

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
const UI_LOCALE_STORAGE_KEY = "clinia_ui_locale_v3";

const SUPPORTED_UI_LOCALES = UI_LOCALES;
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
  if (normalized.startsWith("no") || normalized.startsWith("nb") || normalized.startsWith("nn")) return "no-NO";
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
  `clinia_home_i18n_${locale}_v3`;

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
  no: "norwegian",
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
  no: "Dikter eller skriv diagnosen din.",
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
  no: HOME_STRINGS_NO,
};

const getLocalHomeStrings = (baseLang: string): HomeStrings => {
  // Normalise les variantes (en-CA → en, fr-CA → fr)
  const normalized = baseLang.toLowerCase();
  if (normalized.startsWith("fr")) return HOME_STRINGS_FR;
  if (normalized.startsWith("en")) return HOME_STRINGS_EN;
  if (normalized.startsWith("ja")) return HOME_STRINGS_JA;
  if (normalized.startsWith("zh")) return HOME_STRINGS_ZH;
  if (normalized.startsWith("he") || normalized.startsWith("iw")) return HOME_STRINGS_HE;
  if (normalized.startsWith("es")) return HOME_STRINGS_ES;
  if (normalized.startsWith("ko")) return HOME_STRINGS_KO;
  if (normalized.startsWith("vi")) return HOME_STRINGS_VI;
  if (normalized.startsWith("no")) return HOME_STRINGS_NO;
  return HOME_STRINGS_EN;
};


export const HomeI18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const stored = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);
      if (stored) return normalizeUiLocale(stored);
    } catch {}
    return detectBrowserUiLocale();
  });
  const [strings, setStrings] = useState<HomeStrings>(() => getLocalHomeStrings(toBaseLang(locale)));
  const isTranslating = false;

  useEffect(() => {
    const previousLang = document.documentElement.lang;
    const previousDir = document.documentElement.dir;
    document.documentElement.lang = locale;
    document.documentElement.dir = toBaseLang(locale) === "he" ? "rtl" : "ltr";
    return () => {
      document.documentElement.lang = previousLang;
      document.documentElement.dir = previousDir;
    };
  }, [locale]);

  const setLocaleFromVoice = useCallback(async (target: Locale) => {
    const normalizedTarget = normalizeUiLocale(target);
    const targetBase = toBaseLang(normalizedTarget);
    setLocaleState(normalizedTarget);
    setStrings(getLocalHomeStrings(targetBase));
    try {
      window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, normalizedTarget);
      window.localStorage.removeItem(cacheKeyForLocale(targetBase));
    } catch {}
    return {
      voiceAck: buildVoiceAck(targetBase),
      dictationInstruction: buildDictationPrompt(targetBase),
    };
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
      // Restore the user's explicit selection before browser preferences.
      try {
        const stored = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);
        if (stored) initialLocale = normalizeUiLocale(stored);
      } catch (e) {
        initialLocale = null;
      }

      // Use browser language only when the user has not chosen a locale.
      if (!initialLocale) {
        try {
          initialLocale = detectBrowserUiLocale();
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
