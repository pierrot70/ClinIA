import {
  HOME_STRINGS_EN,
  HOME_STRINGS_ES,
  HOME_STRINGS_FR,
  HOME_STRINGS_HE,
  HOME_STRINGS_JA,
  HOME_STRINGS_KO,
  HOME_STRINGS_VI,
  HOME_STRINGS_ZH,
  type HomeStrings,
} from "../i18n/homeStrings";

const VOICE_ACK_LABELS: Record<string, string> = {
  en: "english",
  es: "spanish",
  de: "german",
  it: "italian",
  pt: "portuguese",
  ja: "japanese",
  ko: "korean",
  vi: "vietnamese",
  zh: "chinese",
  ar: "arabic",
  he: "hebrew",
  ru: "russian",
};

const DICTATION_PROMPT_BY_LANG: Record<string, string> = {
  en: "Please dictate or type your diagnosis.",
  es: "Por favor, dicte o escriba su diagnostico.",
  ja: "音声で診断を入力するか、テキストで入力してください。",
  ko: "진단 내용을 음성으로 말하거나 텍스트로 입력해 주세요.",
  vi: "Vui long doc hoac nhap chan doan cua ban.",
  zh: "Qing koushu huo shuru nin de zhenduan.",
  he: "נא להכתיב או להקליד את האבחנה שלך.",
};

const buildFallbackResult = (targetLang: string): HomeTranslationResult => {
  const normalized = (targetLang || "en").toLowerCase().slice(0, 2);
  const label = VOICE_ACK_LABELS[normalized] || normalized;

  const fallbackStringsByLang: Record<string, HomeStrings> = {
    en: HOME_STRINGS_EN,
    es: HOME_STRINGS_ES,
    ja: HOME_STRINGS_JA,
    ko: HOME_STRINGS_KO,
    vi: HOME_STRINGS_VI,
    zh: HOME_STRINGS_ZH,
    he: HOME_STRINGS_HE,
  };

  const fallbackStrings =
    fallbackStringsByLang[normalized] || HOME_STRINGS_EN;

  const resolvedLang =
    normalized in fallbackStringsByLang ? normalized : "en";

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


  return buildFallbackResult(normalizedTarget);
}
