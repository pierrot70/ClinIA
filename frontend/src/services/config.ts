export const RAW_API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "";
export const API_URL = RAW_API_URL.endsWith("/")
  ? RAW_API_URL.slice(0, -1)
  : RAW_API_URL;

// Log temporaire pour debug en production
// eslint-disable-next-line no-console
console.log("[DEBUG] VITE_API_URL:", import.meta.env.VITE_API_URL, "API_URL:", API_URL);
