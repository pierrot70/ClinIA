import React, { createContext, useContext, useMemo, useState } from "react";
import { HOME_STRINGS_FR, type HomeStrings } from "../i18n/homeStrings";
import { translateHomeStrings } from "../services/i18nApi";

type Locale = "fr" | "en";

type HomeI18nContextValue = {
  locale: Locale;
  strings: HomeStrings;
  isTranslating: boolean;
  setLocaleFromVoice: (target: Locale) => Promise<void>;
};

const HomeI18nContext = createContext<HomeI18nContextValue | null>(null);

const CACHE_KEY_EN = "clinia_home_i18n_en_v1";

export const HomeI18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocale] = useState<Locale>("fr");
  const [strings, setStrings] = useState<HomeStrings>(HOME_STRINGS_FR);
  const [isTranslating, setIsTranslating] = useState(false);

  const setLocaleFromVoice = async (target: Locale) => {
    if (target === locale) {
      return;
    }

    if (target === "fr") {
      setLocale("fr");
      setStrings(HOME_STRINGS_FR);
      return;
    }

    setIsTranslating(true);
    try {
      const cached = window.localStorage.getItem(CACHE_KEY_EN);
      if (cached) {
        const parsed = JSON.parse(cached) as HomeStrings;
        setStrings(parsed);
        setLocale("en");
        return;
      }

      const translated = await translateHomeStrings("en");
      setStrings(translated);
      setLocale("en");
      window.localStorage.setItem(CACHE_KEY_EN, JSON.stringify(translated));
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
