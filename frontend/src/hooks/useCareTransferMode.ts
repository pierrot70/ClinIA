import { useEffect, useState } from "react";
import type { AuthUser } from "../services/authService";
import { getCareTransferCapabilities } from "../services/clinicalCareAccessApi";

type TransferMode = "sender" | "recipient" | "loading" | "unavailable";

type TransferCapabilities = { mode: TransferMode; acceptsNewPatients: boolean | null };

export function useCareTransferMode(user: AuthUser | null): TransferCapabilities {
    const physicianId = user?.role === "MEDECIN" ? user.id : undefined;
    const [resolved, setResolved] = useState<(TransferCapabilities & { physicianId: string }) | null>(null);

    useEffect(() => {
        if (!physicianId) return;
        let current = true;
        void getCareTransferCapabilities().then(response => {
            if (!current) return;
            let mode: TransferMode = "unavailable";
            if ("data" in response && typeof response.data?.canInitiate === "boolean") {
                mode = response.data.canInitiate ? "sender" : "recipient";
            }
            const acceptsNewPatients = "data" in response && typeof response.data?.acceptsNewPatients === "boolean"
                ? response.data.acceptsNewPatients : null;
            setResolved({ physicianId, mode, acceptsNewPatients });
        });
        return () => { current = false; };
    }, [physicianId]);

    if (user?.role === "IPS" && user.id) return { mode: "sender", acceptsNewPatients: null };
    if (!physicianId) return { mode: "unavailable", acceptsNewPatients: null };
    return resolved?.physicianId === physicianId ? resolved : { mode: "loading", acceptsNewPatients: null };
}
