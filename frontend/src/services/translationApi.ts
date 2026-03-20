import { API_URL } from "./config";

export async function translateText({ text, targetLang, namespace = "clinical-demo", sourceLocale = "fr" }: {
  text: string;
  targetLang: string;
  namespace?: string;
  sourceLocale?: string;
}) {
  const response = await fetch(`${API_URL}/translation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang, namespace, sourceLocale }),
  });
  if (!response.ok) {
    throw new Error("Translation API error");
  }
  const json = await response.json();
  return json.translation;
}
