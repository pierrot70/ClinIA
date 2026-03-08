import {
  HOME_STRINGS_EN,
  HOME_STRINGS_FR,
  HOME_STRINGS_ZH,
  type HomeStrings,
} from "../i18n/homeStrings";

const RAW_API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "";
const API_URL = RAW_API_URL.endsWith("/")
  ? RAW_API_URL.slice(0, -1)
  : RAW_API_URL;

const VOICE_ACK_LABELS: Record<string, string> = {
  en: "english",
  es: "spanish",
  de: "german",
  it: "italian",
  pt: "portuguese",
  ja: "japanese",
  ko: "korean",
  zh: "chinese",
  ar: "arabic",
  he: "hebrew",
  ru: "russian",
};

const DICTATION_PROMPT_BY_LANG: Record<string, string> = {
  en: "Please dictate or type your diagnosis.",
  es: "Por favor, dicte o escriba su diagnostico.",
  ja: "Shindan o onsei de nyuryoku suru ka, nyuryoku shite kudasai.",
  zh: "Qing koushu huo shuru nin de zhenduan.",
  he: "Please dictate or type your diagnosis.",
};

const buildFallbackResult = (targetLang: string): HomeTranslationResult => {
  const normalized = (targetLang || "en").toLowerCase().slice(0, 2);
  const label = VOICE_ACK_LABELS[normalized] || normalized;

  const fallbackStrings: HomeStrings =
    normalized === "zh" ? HOME_STRINGS_ZH : HOME_STRINGS_EN;

  const resolvedLang = normalized === "zh" ? "zh" : "en";

  return {
    strings: fallbackStrings,
    voiceAck: `Back in ${label}.`,
    resolvedLang,
    voicePrompts: {
      dictationInstruction:
        DICTATION_PROMPT_BY_LANG[normalized] ||
        DICTATION_PROMPT_BY_LANG.en,
    },
  };
};

export type HomeTranslationResult = {
  strings: HomeStrings;
  voiceAck?: string;
  resolvedLang?: string;
  voicePrompts?: {
    dictationInstruction: string;
  };
};

export async function translateHomeStrings(
  targetLang: string
): Promise<HomeTranslationResult> {
  const normalizedTarget = (targetLang || "").toLowerCase();

  if (targetLang === "fr") {
    return {
      strings: HOME_STRINGS_FR,
      voiceAck: "Retour en francais.",
      resolvedLang: "fr",
      voicePrompts: {
        dictationInstruction: "Dites ou ecrivez votre diagnostic.",
      },
    };
  }

  if (normalizedTarget === "en") {
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
            resolvedLang:
              typeof json?.meta?.lang === "string"
                ? json.meta.lang
                : "en",
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

    return buildFallbackResult("en");
  }

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

    if (!response.ok) {
      return buildFallbackResult(normalizedTarget);
    }

    const json = await response.json();
    if (!json?.data) {
      return buildFallbackResult(normalizedTarget);
    }

    return {
      strings: json.data as HomeStrings,
      voiceAck:
        typeof json?.meta?.voiceAck === "string"
          ? json.meta.voiceAck
          : buildFallbackResult(normalizedTarget).voiceAck,
      resolvedLang:
        typeof json?.meta?.lang === "string"
          ? json.meta.lang
          : normalizedTarget,
      voicePrompts:
        typeof json?.meta?.voicePrompts?.dictationInstruction === "string"
          ? { dictationInstruction: json.meta.voicePrompts.dictationInstruction }
          : buildFallbackResult(normalizedTarget).voicePrompts,
    };
  } catch (e) {
    return buildFallbackResult(normalizedTarget);
  }
}
