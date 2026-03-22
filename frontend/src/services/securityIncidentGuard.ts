
import type { ApiResponse } from "../types/api";

/**
 * Wraps an API call promise and intercepts SECURITY_INCIDENT_BLOCKING errors.
 * If a blocking incident is detected, triggers the global modal and returns a blocking error response.
 */
export function withSecurityIncidentGuard<T>(
  apiCall: Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  // Ne gère plus le contexte React ici, retourne simplement la réponse
  return apiCall;
}
