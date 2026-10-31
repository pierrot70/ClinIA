// Versioned, deterministic workflow. Only state flags enter this resolver:
// no identity, insurance number, DOM snapshot, storage, network or AI service.
export const WALK_IN_GUIDE = { id: "walk-in", version: 1, total: 5 } as const;

export type WalkInGuideState = {
    clinicReady: boolean;
    loading: boolean;
    completed: boolean;
    hasInsuranceNumber: boolean;
    patientCount: number;
    patientSelected: boolean;
    pendingAppointments: number;
    hasAvailability: boolean;
    slotSelected: boolean;
    isNewPatient: boolean;
    detailsComplete: boolean;
    detailsReviewed: boolean;
    hasError: boolean;
    needsLookup: boolean;
};

export type WalkInGuideStep = "clinic" | "lookup" | "identity" | "availability" | "existing"
    | "ambiguous" | "slots" | "details" | "review" | "problem" | "lookupProblem" | "busy" | "done";

export function resolveWalkInGuide(state: WalkInGuideState): {
    key: WalkInGuideStep; current: number; disabled?: boolean;
} {
    if (!state.clinicReady) return { key: "clinic", current: 1 };
    if (state.loading) return { key: "busy", current: state.slotSelected ? 5 : state.patientSelected || state.isNewPatient ? 3 : 1 };
    if (state.completed) return { key: "done", current: 5 };
    if (state.needsLookup) return { key: "lookupProblem", current: 1 };
    if (state.slotSelected) {
        if (state.isNewPatient && (!state.detailsComplete || !state.detailsReviewed)) return { key: "details", current: 4 };
        if (state.hasError) return { key: "problem", current: 5 };
        return { key: "review", current: 5 };
    }
    if (!state.hasInsuranceNumber) return { key: "lookup", current: 1, disabled: true };
    if (!state.patientSelected && state.patientCount) return { key: "identity", current: 2, disabled: state.patientCount !== 1 };
    if (state.pendingAppointments > 1) return { key: "ambiguous", current: 2 };
    if (state.hasAvailability) return { key: "slots", current: 3 };
    if (state.patientSelected && state.pendingAppointments === 1) return { key: "existing", current: 2 };
    if (state.patientSelected || state.isNewPatient) return { key: "availability", current: 3 };
    return { key: "lookup", current: 1 };
}
