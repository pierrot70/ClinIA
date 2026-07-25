import { useState, useCallback } from "react";
import type { ClinicalPayload, ClinicalAnalysis } from "../types/clinical";
import type { SecurityIncidentBlockingData } from "../types/api";
import { authFetch } from "../services/authService";

export function useClinicalAnalysis() {
  const [result, setResult] = useState<ClinicalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<string[]>([]);

  const analyze = useCallback(async (
    payload: ClinicalPayload
  ): Promise<SecurityIncidentBlockingData | null> => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    setErrorFields([]);
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
        setResult(null);
        return json?.blocking ?? null;
      } else {
        setResult(json?.data ?? json);
        return null;
      }
    } catch (e) {
      setError("Erreur réseau ou serveur.");
      setErrorFields([]);
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetAnalysis = useCallback(() => {
    setResult(null);
    setError(null);
    setErrorCode(null);
    setErrorFields([]);
    setLoading(false);
  }, []);

  return {
    result,
    loading,
    error,
    errorCode,
    errorFields,
    analyze,
    resetAnalysis,
  };
}
