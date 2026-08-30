import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { labels } from "../i18n/uiLabels";
import { useAuth } from "../hooks/useAuth";
import { fetchReceptionClinics, type ReceptionClinic } from "../services/receptionApi";
import { useHomeI18n } from "./HomeI18nContext";
import { receptionLabel } from "../i18n/receptionLabels";

const source = labels.receptionClinic;
const storageKeyFor = (userId: string) => `clinia.reception.active-clinic.${userId}`;

type ReceptionClinicContextValue = {
    clinics: ReceptionClinic[];
    activeClinic: ReceptionClinic | null;
    isLoading: boolean;
    error: string;
    changeClinic: () => void;
};

const ReceptionClinicContext = createContext<ReceptionClinicContextValue | undefined>(undefined);

export function ReceptionClinicProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user } = useAuth();
    const { locale } = useHomeI18n();
    const [clinics, setClinics] = useState<ReceptionClinic[]>([]);
    const [activeClinicId, setActiveClinicId] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectionOpen, setSelectionOpen] = useState(false);
    const previousReceptionUserId = useRef<string | null>(null);

    const isReception = isAuthenticated && user?.role === "RECEPTION";
    const userId = user?.id ?? "";

    useEffect(() => {
        if (!isReception || !userId) {
            if (previousReceptionUserId.current) {
                try {
                    window.sessionStorage.removeItem(storageKeyFor(previousReceptionUserId.current));
                } catch {
                    // Storage is only a convenience; the active clinic remains in memory.
                }
            }
            previousReceptionUserId.current = null;
            setClinics([]);
            setActiveClinicId("");
            setSelectionOpen(false);
            setError("");
            return;
        }

        let cancelled = false;
        previousReceptionUserId.current = userId;
        setIsLoading(true);
        setError("");
        setActiveClinicId("");

        void (async () => {
            const response = await fetchReceptionClinics();
            if (cancelled) return;
            setIsLoading(false);
            if (response.error) {
                setError(response.error.message);
                setSelectionOpen(true);
                return;
            }

            const availableClinics = response.data || [];
            setClinics(availableClinics);
            if (availableClinics.length === 1) {
                setActiveClinicId(availableClinics[0]._id);
                setSelectionOpen(false);
                return;
            }

            let savedClinicId = "";
            try {
                savedClinicId = window.sessionStorage.getItem(storageKeyFor(userId)) || "";
            } catch {
                // A selection is still required if session storage is unavailable.
            }
            if (availableClinics.some((clinic) => clinic._id === savedClinicId)) {
                setActiveClinicId(savedClinicId);
                setSelectionOpen(false);
            } else {
                setSelectionOpen(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isReception, userId]);

    const selectClinic = useCallback((clinicId: string) => {
        if (!clinics.some((clinic) => clinic._id === clinicId)) return;
        setActiveClinicId(clinicId);
        setSelectionOpen(false);
        if (userId) {
            try {
                window.sessionStorage.setItem(storageKeyFor(userId), clinicId);
            } catch {
                // The current selection continues to work during this session.
            }
        }
    }, [clinics, userId]);

    const activeClinic = clinics.find((clinic) => clinic._id === activeClinicId) || null;
    const value = useMemo(() => ({
        clinics,
        activeClinic,
        isLoading,
        error,
        changeClinic: () => setSelectionOpen(true),
    }), [activeClinic, clinics, error, isLoading]);

    return (
        <ReceptionClinicContext.Provider value={value}>
            {children}
            {isReception && selectionOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reception-clinic-selection-title">
                    <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                        <h1 id="reception-clinic-selection-title" className="text-xl font-semibold text-slate-900">
                            {receptionLabel(locale, "selectionTitle", source.selectionTitle)}
                        </h1>
                        <p className="mt-2 text-sm text-slate-700">{receptionLabel(locale, "selectionDescription", source.selectionDescription)}</p>
                        {isLoading && <p className="mt-4 text-sm text-slate-600">{receptionLabel(locale, "loading", source.loading)}</p>}
                        {error && <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
                        {!isLoading && !error && (
                            <div className="mt-5 space-y-2">
                                {clinics.map((clinic) => (
                                    <button
                                        key={clinic._id}
                                        type="button"
                                        onClick={() => selectClinic(clinic._id)}
                                        className="block w-full rounded border border-blue-600 px-4 py-3 text-left text-sm font-medium text-blue-800 hover:bg-blue-50"
                                    >
                                        {clinic.nom}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </ReceptionClinicContext.Provider>
    );
}

export function useReceptionClinic() {
    const context = useContext(ReceptionClinicContext);
    if (!context) {
        throw new Error("useReceptionClinic must be used inside ReceptionClinicProvider");
    }
    return context;
}
