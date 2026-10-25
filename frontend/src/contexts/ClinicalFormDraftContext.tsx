import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ClinicalFormDraft } from "../components/clinical/ClinicalForm";

type DraftStore = {
    read: <K extends keyof ClinicalFormDraft>(key: K) => ClinicalFormDraft[K] | undefined;
    save: <K extends keyof ClinicalFormDraft>(key: K, value: ClinicalFormDraft[K]) => void;
    clear: () => void;
};
const Context = createContext<DraftStore | null>(null);

// One manual/example form per signed-in session. No browser storage or history.
export function ClinicalFormDraftProvider({ children }: { children: React.ReactNode }) {
    const draft = useRef<Partial<ClinicalFormDraft>>({});
    const active = useRef(true);
    useEffect(() => {
        active.current = true;
        return () => { active.current = false; draft.current = {}; };
    }, []);
    const read = useCallback(<K extends keyof ClinicalFormDraft,>(key: K) => {
        const value = active.current ? draft.current[key] : undefined;
        return value === undefined ? undefined : structuredClone(value);
    }, []);
    const save = useCallback(<K extends keyof ClinicalFormDraft,>(key: K, value: ClinicalFormDraft[K]) => {
        if (active.current) draft.current[key] = structuredClone(value);
    }, []);
    const clear = useCallback(() => { draft.current = {}; }, []);
    const store = useMemo(() => ({ read, save, clear }), [read, save, clear]);
    return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useHasClinicalFormDraft() {
    const store = useContext(Context);
    const [present] = useState(() => store?.read("form") !== undefined);
    return present;
}

export const useClearClinicalFormDraft = () => useContext(Context)?.clear;

export function useClinicalFormDraftState<K extends keyof ClinicalFormDraft>(
    key: K, initial: ClinicalFormDraft[K] | (() => ClinicalFormDraft[K]), enabled: boolean,
): [ClinicalFormDraft[K], React.Dispatch<React.SetStateAction<ClinicalFormDraft[K]>>] {
    const store = useContext(Context);
    const [value, setValue] = useState<ClinicalFormDraft[K]>(() =>
        (enabled ? store?.read(key) : undefined) ?? (typeof initial === "function" ? initial() : initial));
    const latest = useRef(value);
    const mounted = useRef(true);
    latest.current = value;
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const set = useCallback<React.Dispatch<React.SetStateAction<ClinicalFormDraft[K]>>>((next) => {
        if (!mounted.current) return;
        const result = typeof next === "function" ? next(latest.current) : next;
        latest.current = result;
        if (enabled) store?.save(key, result);
        setValue(result);
    }, [enabled, key, store]);
    return [value, set];
}
