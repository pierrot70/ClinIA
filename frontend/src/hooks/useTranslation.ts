import { useEffect, useState, useRef } from "react";
import { translateText } from "../services/translationApi";
import { enFallback } from "../i18n/enFallback";

const translationCache = new Map();

export function useTranslation({ text, targetLang, namespace = "clinical-demo", sourceLocale = "fr" }: {
  text: string;
  targetLang: string;
  namespace?: string;
  sourceLocale?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const cacheKey = `${namespace}|${sourceLocale}|${targetLang}|${text}`;
  const [translated, setTranslated] = useState(text);
  const [loading, setLoading] = useState(targetLang !== sourceLocale);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    setError(null);
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
    translateText({ text, targetLang, namespace, sourceLocale })
      .then((result) => {
        if (isMounted.current) {
          translationCache.set(cacheKey, result);
          setTranslated(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted.current) {
          // Fallback anglais si la traduction échoue
          if (targetLang.startsWith("en")) {
            setTranslated(text);
          } else if (enFallback[text]) {
            setTranslated(enFallback[text]);
          } else {
            setTranslated(text);
          }
          setError("Erreur de traduction");
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
