import { API_URL } from "./config";


export async function translateText({ text, targetLang, namespace = "clinical-demo", sourceLocale = "fr", openaiModel }: {
  text: string;
  targetLang: string;
  namespace?: string;
  sourceLocale?: string;
  openaiModel?: string;
}) {
  const response = await fetch(`${API_URL}/api/translation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang, namespace, sourceLocale, ...(openaiModel ? { openaiModel } : {}) }),
  });
  if (!response.ok) {
    throw new Error("Translation API error");
  }
  const json = await response.json();
  return json.translation;
}

// Nouvelle fonction pour forcer la sauvegarde d'une traduction locale dans la base
export async function saveLocalTranslation({ text, translated, targetLang, namespace = "clinical-demo", sourceLocale = "fr" }: {
  text: string;
  translated: string;
  targetLang: string;
  namespace?: string;
  sourceLocale?: string;
}) {
  // On utilise un endpoint spécial ou une option 'forceSave' à ajouter côté backend si besoin
  const response = await fetch(`${API_URL}/api/translation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang, namespace, sourceLocale, translated, forceSave: true }),
  });
  if (!response.ok) {
    throw new Error("Save translation API error");
  }
  const json = await response.json();
  return json.translation;
}
