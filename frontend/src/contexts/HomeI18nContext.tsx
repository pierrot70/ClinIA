import React, { createContext, useContext, useMemo, useState } from "react";
import {
  HOME_STRINGS_EN,
  HOME_STRINGS_FR,
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
  setLocaleFromVoice: (target: Locale) => Promise<VoicePromptPayload>;
};

const HomeI18nContext = createContext<HomeI18nContextValue | null>(null);

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
  ja: "Shindan o onsei de nyuryoku suru ka, nyuryoku shite kudasai.",
  ko: "Jindaneul malhagena ibryeokhae juseyo.",
  zh: "Qing koushu huo shuru nin de zhenduan.",
  he: "Please dictate or type your diagnosis.",
};

const buildDictationPrompt = (localeCode: string) => {
  const normalized = (localeCode || "fr").toLowerCase().slice(0, 2);
  return DICTATION_PROMPT_BY_LANG[normalized] || DICTATION_PROMPT_BY_LANG.en;
};

export const HomeI18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocale] = useState<Locale>("fr");
  const [strings, setStrings] = useState<HomeStrings>(HOME_STRINGS_FR);
  const [isTranslating, setIsTranslating] = useState(false);

  const setLocaleFromVoice = async (target: Locale) => {
    const normalizedTarget = (target || "fr").toLowerCase();

    if (!normalizedTarget || normalizedTarget === "fr") {
      setLocale("fr");
      setStrings(HOME_STRINGS_FR);
      return {
        voiceAck: buildVoiceAck("fr"),
        dictationInstruction: buildDictationPrompt("fr"),
      };
    }

    if (normalizedTarget === locale) {
      return {
        voiceAck: buildVoiceAck(normalizedTarget),
        dictationInstruction: buildDictationPrompt(normalizedTarget),
      };
    }

    setIsTranslating(true);
    try {
      const cached = window.localStorage.getItem(
        cacheKeyForLocale(normalizedTarget)
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
        const targetBase = normalizedTarget.slice(0, 2);
        const isFallbackEnglishUnderNonEnglishTarget =
          targetBase !== "en" &&
          JSON.stringify(cachedStrings) === JSON.stringify(HOME_STRINGS_EN);

        if (
          (cachedBase && cachedBase !== targetBase) ||
          isFallbackEnglishUnderNonEnglishTarget
        ) {
          window.localStorage.removeItem(cacheKeyForLocale(normalizedTarget));
        } else {
          setStrings(cachedStrings);
          setLocale(normalizedTarget);
          return {
            voiceAck: buildVoiceAck(normalizedTarget),
            dictationInstruction:
              cachedPrompt || buildDictationPrompt(normalizedTarget),
          };
        }
      }

      const translated = await translateHomeStrings(normalizedTarget);

      const translatedBase = (translated.resolvedLang || "")
        .toLowerCase()
        .slice(0, 2);
      const targetBase = normalizedTarget.slice(0, 2);
      const isMismatchedTranslation =
        translatedBase.length > 0 && translatedBase !== targetBase;

      if (isMismatchedTranslation) {
        throw new Error("MISMATCHED_TRANSLATION_LOCALE");
      }

      setStrings(translated.strings);
      setLocale(normalizedTarget);
      window.localStorage.setItem(
        cacheKeyForLocale(normalizedTarget),
        JSON.stringify({
          strings: translated.strings,
          resolvedLang: translated.resolvedLang || normalizedTarget,
          voicePrompts: translated.voicePrompts,
        })
      );
      return {
        voiceAck: translated.voiceAck || buildVoiceAck(normalizedTarget),
        dictationInstruction:
          translated.voicePrompts?.dictationInstruction ||
          buildDictationPrompt(normalizedTarget),
      };
    } catch (err) {
      setLocale("fr");
      setStrings(HOME_STRINGS_FR);
      throw err;
    } finally {
      setIsTranslating(false);
    }
  };

  const value = useMemo<HomeI18nContextValue>(
    () => ({
      locale,
      strings,
      isTranslating,
      setLocaleFromVoice,
    }),
    [locale, strings, isTranslating]
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
