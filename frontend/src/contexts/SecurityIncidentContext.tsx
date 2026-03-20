import React, { createContext, useContext, useState, useCallback } from "react";
import type { SecurityIncidentBlockingData } from "../types/api";

interface SecurityIncidentContextValue {
  blockingIncident: SecurityIncidentBlockingData | null;
  setBlockingIncident: (incident: SecurityIncidentBlockingData | null) => void;
}

const SecurityIncidentContext = createContext<SecurityIncidentContextValue | undefined>(undefined);

export const SecurityIncidentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [blockingIncident, setBlockingIncident] = useState<SecurityIncidentBlockingData | null>(null);

  const setBlockingIncidentCallback = useCallback((incident: SecurityIncidentBlockingData | null) => {
    setBlockingIncident(incident);
  }, []);

  return (
    <SecurityIncidentContext.Provider value={{ blockingIncident, setBlockingIncident: setBlockingIncidentCallback }}>
      {children}
    </SecurityIncidentContext.Provider>
  );
};

export function useSecurityIncident() {
  const ctx = useContext(SecurityIncidentContext);
  if (!ctx) throw new Error("useSecurityIncident must be used within SecurityIncidentProvider");
  return ctx;
}
