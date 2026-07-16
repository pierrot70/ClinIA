import { API_URL } from "./config";
import { authFetch } from "./authService";


export async function translateText({ translationKey, targetLang }: {
  translationKey: string;
  targetLang: string;
}) {
  const response = await authFetch(`${API_URL}/api/translation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ translationKey, targetLang }),
  });
  if (!response.ok) {
    throw new Error("Translation API error");
  }
  const json = await response.json();
  return json.translation;
}
