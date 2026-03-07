import { HOME_STRINGS_FR, type HomeStrings } from "../i18n/homeStrings";

const API_URL = import.meta.env.VITE_API_URL as string;

export async function translateHomeStrings(
  targetLang: string
): Promise<HomeStrings> {
  if (targetLang === "fr") {
    return HOME_STRINGS_FR;
  }

  const response = await fetch(`${API_URL}/api/i18n/home-translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetLang,
      sourceStrings: HOME_STRINGS_FR,
    }),
  });

  if (!response.ok) {
    throw new Error(`Translation request failed with ${response.status}`);
  }

  const json = await response.json();
  if (!json?.data) {
    throw new Error("Invalid translation payload");
  }

  return json.data as HomeStrings;
}
