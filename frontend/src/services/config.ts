const RAW_API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "";

function getFallbackApiUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return "http://localhost:4000";
  }

  return "";
}

const normalizedRawApiUrl = RAW_API_URL || getFallbackApiUrl();

export const API_URL = normalizedRawApiUrl.endsWith("/")
  ? normalizedRawApiUrl.slice(0, -1)
  : normalizedRawApiUrl;
