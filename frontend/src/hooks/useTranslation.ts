import { useEffect, useState, useRef } from "react";
import { translateText, saveLocalTranslation } from "../services/translationApi";
import { enFallback } from "../i18n/enFallback";

// Fallbacks locaux pour les labels critiques (clé = texte source)
const criticalLabelFallbacks: Record<string, Record<string, string>> = {
    "Exemple de cas fictif : patient de 55 ans présentant de la fatigue, une polyurie et une polydipsie.": {
      "en": "Example case: 55-year-old patient with fatigue, polyuria and polydipsia.",
      "en-CA": "Example case: 55-year-old patient with fatigue, polyuria and polydipsia.",
      "default": "Example case: 55-year-old patient with fatigue, polyuria and polydipsia."
    },
    "Exemple de cas fictif: patient de 55 ans avec fatigue, polyurie et polydipsie.": {
      "en": "Example case: 55-year-old patient with fatigue, polyuria and polydipsia.",
      "en-CA": "Example case: 55-year-old patient with fatigue, polyuria and polydipsia.",
      "default": "Example case: 55-year-old patient with fatigue, polyuria and polydipsia."
    },
  // (doublons supprimés ci-dessous)
  "Modèle OpenAI": {
    "en-CA": "OpenAI Model",
    "en": "OpenAI Model",
    "fr-CA": "OpenAI Model",
    "fr": "OpenAI Model",
    "default": "OpenAI Model",
  },
  "OpenAIモデル": {
    "default": "OpenAI Model",
  },
  "gpt-4.1-mini (JSON natif)": {
    "default": "gpt-4.1-mini",
  },
  "gpt-4-0613 (legacy)": {
    "default": "gpt-4-0613",
  },
  // Ajoutez ici d'autres labels critiques si besoin
};

const translationCache = new Map();

export function useTranslation({ text, targetLang, namespace = "clinical-demo", sourceLocale = "fr", openaiModel }: {
  text: string;
  targetLang: string;
  namespace?: string;
  sourceLocale?: string;
  openaiModel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const cacheKey = `${namespace}|${sourceLocale}|${targetLang}|${text}`;
  const [translated, setTranslated] = useState(text);
  const [loading, setLoading] = useState(targetLang !== sourceLocale);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    setError(null);
    // Fallback local prioritaire pour les labels critiques, même si la langue source et la langue cible sont identiques
    const fallback =
      criticalLabelFallbacks[text]?.[targetLang] ||
      criticalLabelFallbacks[text]?.[targetLang.split("-")[0]] ||
      criticalLabelFallbacks[text]?.["default"];
    if (fallback) {
      setTranslated(fallback);
      setLoading(false);
      // Sauvegarde explicite du fallback local dans la base
      saveLocalTranslation({
        text,
        translated: fallback,
        targetLang,
        namespace,
        sourceLocale,
      }).catch(() => {});
      return;
    }
    if (targetLang === sourceLocale) {
      setTranslated(text);
      setLoading(false);
      return;
    }
    if (translationCache.has(cacheKey)) {
      setTranslated(translationCache.get(cacheKey));
      setLoading(false);
      return;
    }
    setLoading(true);
    translateText({ text, targetLang, namespace, sourceLocale, openaiModel })
      .then((result) => {
        if (isMounted.current) {
          let clean = result;
          if (typeof clean === "string" && clean.match(/^Le texte reste le m[êe]me/)) {
            clean = text;
          }
          translationCache.set(cacheKey, clean);
          setTranslated(clean);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted.current) {
          // Fallback local pour les labels critiques
          const fallback =
            criticalLabelFallbacks[text]?.[targetLang] ||
            criticalLabelFallbacks[text]?.[targetLang.split("-")[0]] ||
            criticalLabelFallbacks[text]?.["default"];
          if (fallback) {
            setTranslated(fallback);
            // Sauvegarde explicite du fallback local dans la base
            saveLocalTranslation({
              text,
              translated: fallback,
              targetLang,
              namespace,
              sourceLocale,
            }).catch(() => {});
          } else if (targetLang.startsWith("en")) {
            setTranslated(text);
          } else if (enFallback[text]) {
            setTranslated(enFallback[text]);
          } else {
            setTranslated(text);
          }
          setError(err?.message || String(err) || "Translation failed");
          setLoading(false);
        }
      });
    return () => {
      isMounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, targetLang, namespace, sourceLocale]);

  return { translated, loading, error };
}
