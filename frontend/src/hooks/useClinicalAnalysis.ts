import { useState, useCallback } from "react";
import type { ClinicalPayload, ClinicalAnalysis } from "../types/clinical";
import { authFetch } from "../services/authService";

export function useClinicalAnalysis() {
  const [result, setResult] = useState<ClinicalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (payload: ClinicalPayload) => {
    setLoading(true);
    setError(null);
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
        setResult(null);
      } else {
        setResult(json?.data ?? json);
      }
    } catch (e) {
      setError("Erreur réseau ou serveur.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, analyze };
}
