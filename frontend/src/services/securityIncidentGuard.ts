import type { ApiResponse, SecurityIncidentBlockingData } from "../types/api";
import { useSecurityIncident } from "../contexts/SecurityIncidentContext";

/**
 * Wraps an API call promise and intercepts SECURITY_INCIDENT_BLOCKING errors.
 * If a blocking incident is detected, triggers the global modal and returns a blocking error response.
 */
export async function withSecurityIncidentGuard<T>(
  apiCall: Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  const { setBlockingIncident } = useSecurityIncident();
  const response = await apiCall;

  if (
    response &&
    typeof response === "object" &&
    "error" in response &&
    response.error?.code === "SECURITY_INCIDENT_BLOCKING" &&
    response.blocking &&
    response.blocking.required
  ) {
    setBlockingIncident(response.blocking as SecurityIncidentBlockingData);
  }

  return response;
}
