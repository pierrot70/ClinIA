import { useState, useCallback } from "react";
import type { ClinicalPayload, ClinicalAnalysis } from "../types/clinical";
import type { SecurityIncidentBlockingData } from "../types/api";
import { authFetch } from "../services/authService";

const MIN_LOADING_INDICATOR_MS = 500;

export type ClinicalAnalysisResponseMeta = {
  source?: string;
  model?: string;
  cacheHit?: boolean;
};

export function useClinicalAnalysis() {
  const [result, setResult] = useState<ClinicalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<string[]>([]);
  const [responseMeta, setResponseMeta] = useState<ClinicalAnalysisResponseMeta | null>(null);

  const analyze = useCallback(async (
    payload: ClinicalPayload
  ): Promise<SecurityIncidentBlockingData | null> => {
    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    setErrorCode(null);
    setErrorFields([]);
    setResponseMeta(null);
    setResult(null);
    try {
      const res = await authFetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json?.error) {
        setError(json.error.message || "Erreur lors de l’analyse.");
        setErrorCode(json.error.code || null);
        setErrorFields(
          Array.isArray(json.error.fields)
            ? json.error.fields.filter((field: unknown): field is string =>
                typeof field === "string"
              )
            : []
        );
        setResponseMeta(null);
        setResult(null);
        return json?.blocking ?? null;
      } else {
        setResult(json?.data ?? json);
        setResponseMeta(
          json?.meta && typeof json.meta === "object"
            ? json.meta as ClinicalAnalysisResponseMeta
            : null
        );
        return null;
      }
    } catch (e) {
      setError("Erreur réseau ou serveur.");
      setErrorFields([]);
      setResponseMeta(null);
      setResult(null);
      return null;
    } finally {
      const remainingIndicatorTime = MIN_LOADING_INDICATOR_MS - (Date.now() - startedAt);
      if (remainingIndicatorTime > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remainingIndicatorTime);
        });
      }
      setLoading(false);
    }
  }, []);

  const resetAnalysis = useCallback(() => {
    setResult(null);
    setError(null);
    setErrorCode(null);
    setErrorFields([]);
    setResponseMeta(null);
    setLoading(false);
  }, []);

  return {
    result,
    loading,
    error,
    errorCode,
    errorFields,
    responseMeta,
    analyze,
    resetAnalysis,
  };
}
