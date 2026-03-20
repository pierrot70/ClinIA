import { withSecurityIncidentGuard } from "./securityIncidentGuard";
import type { ApiResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL as string;

if (!API_URL) {
    throw new Error("VITE_API_URL is not defined");
}

export const REQUIRED_ACK_ACTION = "J'ai lu et compris";

export interface SecurityIncidentAcknowledgePayload {
    incidentId: string;
    action: string;
    context: Record<string, unknown>;
}

export interface SecurityIncidentAcknowledgeResult {
    incidentId: string;
    acknowledged: boolean;
    acknowledgedAt: string;
    action: string;
    context: Record<string, unknown>;
}

export async function acknowledgeSecurityIncident(
    payload: SecurityIncidentAcknowledgePayload
): Promise<ApiResponse<SecurityIncidentAcknowledgeResult>> {
    return withSecurityIncidentGuard(
        (async () => {
            try {
                const response = await fetch(
                    `${API_URL}/api/security/incidents/acknowledge`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(payload),
                    }
                );
                return (await response.json()) as ApiResponse<SecurityIncidentAcknowledgeResult>;
            } catch {
                return {
                    error: {
                        code: "INTERNAL_ERROR",
                        message:
                            "Impossible d'enregistrer l'acknowledgment de securite. Verifiez la connexion puis reessayez.",
                        retryable: true,
                    },
                };
            }
        })()
    );
}
