import { useEffect, useState, useRef } from "react";
import { translateText } from "../services/translationApi";
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
  "ClinIA": {
    "default": "ClinIA",
  },
  // TODO: Un médecin peut écrire "Ho" comme symptôme en vietnamien (toux).
  // Garder ces labels courts hors traduction IA: OpenAI peut retourner une explication
  // au lieu d'un libellé utilisable pour des mots très courts comme Nom/Prénom/Rue.
  // Les libellés cliniques ambigus doivent rester des libellés UI, pas des phrases explicatives.
  "Nom": {
    "vi": "Họ",
  },
  "Nom *": {
    "vi": "Họ *",
  },
  "Prénom": {
    "vi": "Tên",
  },
  "Prénom *": {
    "vi": "Tên *",
  },
  "Rue": {
    "vi": "Đường",
  },
  "Disponibilités": {
    "vi": "Lịch trống",
  },
  // Libellés techniques des journaux: garder une terminologie anglaise stable
  // dans les langues où la traduction automatique rend le sens moins clair.
  "Nom d'utilisateur masqué": {
    "vi": "Masked username",
  },
  "Transport": {
    "default": "Transport",
  },
  "log": {
    "default": "log",
  },
  "logs": {
    "default": "logs",
  },
  // Ajoutez ici d'autres labels critiques si besoin
};

const translationCache = new Map();
const APPROVED_UI_TRANSLATION_STORAGE_PREFIX = "clinia_ui_translation_v1";

function getStoredTranslation(cacheKey: string) {
  try {
    const translation = window.localStorage.getItem(
      `${APPROVED_UI_TRANSLATION_STORAGE_PREFIX}:${cacheKey}`
    );
    return translation || null;
  } catch {
    return null;
  }
}

function storeTranslation(cacheKey: string, translation: string) {
  try {
    window.localStorage.setItem(
      `${APPROVED_UI_TRANSLATION_STORAGE_PREFIX}:${cacheKey}`,
      translation
    );
  } catch {
    // Translation labels remain available from the in-memory cache if storage is unavailable.
  }
}

function baseLocale(locale: string) {
  return locale.toLowerCase().split("-")[0];
}

function shouldTranslateText(text: unknown) {
  return typeof text === "string" && /[\p{L}\p{N}]/u.test(text.trim());
}

export function useTranslation({ text, targetLang, namespace = "clinical-demo", sourceLocale = "fr", openaiModel, translationKey }: {
  text: string;
  targetLang: string;
  namespace?: string;
  sourceLocale?: string;
  openaiModel?: string;
  translationKey?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const cacheKey = `${translationKey || "local"}|${targetLang}`;
  const isSourceLocale = baseLocale(targetLang) === baseLocale(sourceLocale);
  const [translated, setTranslated] = useState(text);
  const [loading, setLoading] = useState(!isSourceLocale);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;
    let disposed = false;
    setError(null);
    if (!shouldTranslateText(text)) {
      setTranslated(text);
      setLoading(false);
      return;
    }
    // Fallback local prioritaire pour les labels critiques, même si la langue source et la langue cible sont identiques
    const fallback =
      criticalLabelFallbacks[text]?.[targetLang] ||
      criticalLabelFallbacks[text]?.[targetLang.split("-")[0]] ||
      criticalLabelFallbacks[text]?.["default"];
    if (fallback) {
      setTranslated(fallback);
      setLoading(false);
      return;
    }
    if (isSourceLocale) {
      setTranslated(text);
      setLoading(false);
      return;
    }
    if (!translationKey) {
      setTranslated(enFallback[text] || text);
      setLoading(false);
      return;
    }
    if (translationCache.has(cacheKey)) {
      setTranslated(translationCache.get(cacheKey));
      setLoading(false);
      return;
    }
    // Only opaque, backend-approved UI keys reach this branch. Never persist
    // clinical text, patient data, or generated analysis content in browser storage.
    const storedTranslation = getStoredTranslation(cacheKey);
    if (storedTranslation) {
      translationCache.set(cacheKey, storedTranslation);
      setTranslated(storedTranslation);
      setLoading(false);
      return;
    }
    setLoading(true);
    translateText({ translationKey, targetLang })
      .then((result) => {
        if (!disposed && requestVersionRef.current === requestVersion) {
          let clean = result;
          if (typeof clean === "string" && clean.match(/^Le texte reste le m[êe]me/)) {
            clean = text;
          }
          translationCache.set(cacheKey, clean);
          storeTranslation(cacheKey, clean);
          setTranslated(clean);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!disposed && requestVersionRef.current === requestVersion) {
          // Fallback local pour les labels critiques
          const fallback =
            criticalLabelFallbacks[text]?.[targetLang] ||
            criticalLabelFallbacks[text]?.[targetLang.split("-")[0]] ||
            criticalLabelFallbacks[text]?.["default"];
          if (fallback) {
            setTranslated(fallback);
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
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, targetLang, namespace, sourceLocale, translationKey]);

  return { translated, loading, error };
}
