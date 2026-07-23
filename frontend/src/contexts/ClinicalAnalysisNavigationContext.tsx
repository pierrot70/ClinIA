import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ClinicalPayload } from "../types/clinical";
import { clearLegacyClinicalBrowserStorage } from "../utils/clinicalBrowserStorage";

type PendingClinicalAnalysis = {
  payload: ClinicalPayload;
  patientDisplayName?: string;
};

type ClinicalAnalysisNavigationContextValue = {
  pendingClinicalAnalysis: PendingClinicalAnalysis | null;
  setPendingClinicalAnalysis: (analysis: PendingClinicalAnalysis) => void;
  clearPendingClinicalAnalysis: () => void;
};

const ClinicalAnalysisNavigationContext =
  createContext<ClinicalAnalysisNavigationContextValue | null>(null);

export function ClinicalAnalysisNavigationProvider({
  children,
  initialPendingClinicalAnalysis = null,
}: {
  children: React.ReactNode;
  initialPendingClinicalAnalysis?: PendingClinicalAnalysis | null;
}) {
  const [pendingClinicalAnalysis, setPendingClinicalAnalysisState] =
    useState<PendingClinicalAnalysis | null>(initialPendingClinicalAnalysis);

  useEffect(() => {
    clearLegacyClinicalBrowserStorage();
  }, []);

  const setPendingClinicalAnalysis = useCallback(
    (analysis: PendingClinicalAnalysis) => {
      setPendingClinicalAnalysisState(analysis);
    },
    []
  );

  const clearPendingClinicalAnalysis = useCallback(() => {
    setPendingClinicalAnalysisState(null);
  }, []);

  const value = useMemo(
    () => ({
      pendingClinicalAnalysis,
      setPendingClinicalAnalysis,
      clearPendingClinicalAnalysis,
    }),
    [clearPendingClinicalAnalysis, pendingClinicalAnalysis, setPendingClinicalAnalysis]
  );

  return (
    <ClinicalAnalysisNavigationContext.Provider value={value}>
      {children}
    </ClinicalAnalysisNavigationContext.Provider>
  );
}

export function useClinicalAnalysisNavigation() {
  const context = useContext(ClinicalAnalysisNavigationContext);
  if (!context) {
    throw new Error(
      "useClinicalAnalysisNavigation must be used within ClinicalAnalysisNavigationProvider"
    );
  }

  return context;
}
