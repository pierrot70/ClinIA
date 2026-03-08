import {
  HOME_STRINGS_EN,
  HOME_STRINGS_FR,
  type HomeStrings,
} from "../i18n/homeStrings";

const API_URL = import.meta.env.VITE_API_URL as string;

export type HomeTranslationResult = {
  strings: HomeStrings;
  voiceAck?: string;
  voicePrompts?: {
    dictationInstruction: string;
  };
};

export async function translateHomeStrings(
  targetLang: string
): Promise<HomeTranslationResult> {
  if (targetLang === "fr") {
    return {
      strings: HOME_STRINGS_FR,
      voiceAck: "Retour en francais.",
      voicePrompts: {
        dictationInstruction: "Dites ou ecrivez votre diagnostic.",
      },
    };
  }

  if (targetLang === "en") {
    try {
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

      if (response.ok) {
        const json = await response.json();
        if (json?.data) {
          return {
            strings: json.data as HomeStrings,
            voiceAck:
              typeof json?.meta?.voiceAck === "string"
                ? json.meta.voiceAck
                : "Back in english.",
            voicePrompts:
              typeof json?.meta?.voicePrompts?.dictationInstruction === "string"
                ? {
                    dictationInstruction:
                      json.meta.voicePrompts.dictationInstruction,
                  }
                : { dictationInstruction: "Please dictate or type your diagnosis." },
          };
        }
      }
    } catch (e) {
      // Ignore remote failure: local EN fallback below keeps voice command reliable in prod.
    }

    return {
      strings: HOME_STRINGS_EN,
      voiceAck: "Back in english.",
      voicePrompts: {
        dictationInstruction: "Please dictate or type your diagnosis.",
      },
    };
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

  return {
    strings: json.data as HomeStrings,
    voiceAck: typeof json?.meta?.voiceAck === "string" ? json.meta.voiceAck : undefined,
    voicePrompts:
      typeof json?.meta?.voicePrompts?.dictationInstruction === "string"
        ? { dictationInstruction: json.meta.voicePrompts.dictationInstruction }
        : undefined,
  };
}
