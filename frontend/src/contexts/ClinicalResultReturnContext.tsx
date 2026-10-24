import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { ClinicalDemoResultProps } from "../components/ClinicalDemoResult";
import type { DetailTreatment } from "../pages/TreatmentDetails";
import { useAuth } from "../hooks/useAuth";

type ResultView = Pick<ClinicalDemoResultProps, "demoData" | "sourceMode" | "realAI" | "patientContext" | "patientDisplayName">;
export type ClinicalResultSnapshot = { view: ResultView; treatments: DetailTreatment[] };
const Context = createContext<{
    save: (key: string, snapshot: ClinicalResultSnapshot) => void;
    read: (key: string) => ClinicalResultSnapshot | undefined;
} | null>(null);

// Clinical data stays in memory, bounded to eight views, never in browser storage
// or navigation history. Reload and session/identity changes discard it.
export function ClinicalResultReturnProvider({ children }: { children: React.ReactNode }) {
    const snapshots = useRef(new Map<string, ClinicalResultSnapshot>());
    useEffect(() => {
        const entries = snapshots.current;
        return () => entries.clear();
    }, []);
    const save = useCallback((key: string, snapshot: ClinicalResultSnapshot) => {
        snapshots.current.delete(key);
        snapshots.current.set(key, structuredClone(snapshot));
        if (snapshots.current.size > 8) snapshots.current.delete(snapshots.current.keys().next().value!);
    }, []);
    const read = useCallback((key: string) => snapshots.current.get(key), []);
    const value = useMemo(() => ({ save, read }), [save, read]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function ClinicalResultSessionProvider({ children }: { children: React.ReactNode }) {
    const { status, user } = useAuth();
    const identity = `${status}:${user?.id ?? user?.email ?? "anonymous"}`;
    return <ClinicalResultReturnProvider key={identity}>{children}</ClinicalResultReturnProvider>;
}

export const useClinicalResultReturn = () => useContext(Context);
