import React, { createContext, useContext, useMemo, useState } from "react";
import { HOME_STRINGS_FR, type HomeStrings } from "../i18n/homeStrings";
import { translateHomeStrings } from "../services/i18nApi";

type Locale = string;

type HomeI18nContextValue = {
  locale: Locale;
  strings: HomeStrings;
  isTranslating: boolean;
  setLocaleFromVoice: (target: Locale) => Promise<void>;
};

const HomeI18nContext = createContext<HomeI18nContextValue | null>(null);

const cacheKeyForLocale = (locale: string) =>
  `clinia_home_i18n_${locale}_v1`;

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
      return;
    }

    if (normalizedTarget === locale) {
      return;
    }

    setIsTranslating(true);
    try {
      const cached = window.localStorage.getItem(
        cacheKeyForLocale(normalizedTarget)
      );
      if (cached) {
        const parsed = JSON.parse(cached) as HomeStrings;
        setStrings(parsed);
        setLocale(normalizedTarget);
        return;
      }

      const translated = await translateHomeStrings(normalizedTarget);
      setStrings(translated);
      setLocale(normalizedTarget);
      window.localStorage.setItem(
        cacheKeyForLocale(normalizedTarget),
        JSON.stringify(translated)
      );
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
