import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Mic, MicOff } from "lucide-react";
import { useHomeI18n } from "../contexts/HomeI18nContext";

type NavCommand = {
    label: string;
    path: string;
    keywords: string[];
};

type ActionCommand = {
    label: string;
    action: "dictation" | "execute" | "clear" | "stop";
    keywords: string[];
    response: string;
};

const normalizeText = (value: string) =>
    value
        .toLowerCase()
        // NFKD handles compatibility forms (e.g. full-width latin chars),
        // making commands like "In French" parse consistently across locales.
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const LANGUAGE_ALIASES: Record<string, string> = {
    // French
    francais: "fr",
    français: "fr",
    french: "fr",
    anglais: "en",
    english: "en",
    allemand: "de",
    allemande: "de",
    deutsch: "de",
    german: "de",
    japonais: "ja",
    japan: "ja",
    japanese: "ja",
    nihongo: "ja",
    chinois: "zh",
    chinoismandarin: "zh",
    mandarin: "zh",
    chinese: "zh",
    espagnol: "es",
    espanol: "es",
    español: "es",
    spanish: "es",
    hebreu: "he",
    hébreu: "he",
    hebrew: "he",
    // Japanese words for French (common STT outputs)
    フランス語: "fr",
    フランス: "fr",
    フレンチ: "fr",
    フランセ: "fr",
    castillan: "es",
    castellano: "es",
    // Native scripts
    日本語: "ja",
    中文: "zh",
    漢語: "zh",
    汉语: "zh",
    עברית: "he",
    法语: "fr",
    法文: "fr",
    deutschsprache: "de",
};

const FORCE_FRENCH_KEYWORDS = [
    "francais",
    "français",
    "french",
    "in french",
    "infrench",
    "en french",
    "enfrancais",
    "enfrançais",
    "french language",
    "language french",
    "retour francais",
    "retour français",
    "back to french",
    "reset french",
    "switch to french",
    "set french",
    "france",
    "法语",
    "法文",
    "フランス語",
    "フランス",
    "フレンチ",
    "フランチ",
    "フランスゴ",
    "仏語",
    "佛語",
    "インフレンチ",
    "インフランセ",
    "エンフレンチ",
    "エンフランス",
    "furansu",
];

const hasAliasAsWholeWord = (normalizedTextValue: string, alias: string) => {
    const aliasNormalized = normalizeText(alias);
    if (!aliasNormalized) {
        return false;
    }

    if (aliasNormalized.length <= 2) {
        return normalizedTextValue === aliasNormalized;
    }

    const escaped = aliasNormalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
    return re.test(normalizedTextValue);
};

const detectLocaleFromTranscript = (transcript: string): string | null => {
    const raw = (transcript || "").trim();
    if (!raw) {
        return null;
    }

    const rawLower = raw.toLowerCase();
    const normalized = normalizeText(rawLower);
    const compactRawLower = rawLower.replace(/\s+/g, "");
    const compactNormalized = normalized.replace(/\s+/g, "");

    // Strong phonetic fallback for Japanese STT variants of "In French".
    const phoneticFrenchIntent =
        /(?:\bin\b|\ben\b|イン|エン|いん|えん)\s*(?:french|francais|français|fr|フ(?:ラ|レ)ン(?:ス|チ|シ)|ふ(?:ら|れ)ん(?:す|ち|し)|法(?:语|文)|仏語|佛語)/i;
    if (
        phoneticFrenchIntent.test(raw) ||
        phoneticFrenchIntent.test(compactRawLower) ||
        phoneticFrenchIntent.test(compactNormalized)
    ) {
        return "fr";
    }

    // Cross-script safety net: if transcript clearly mentions French,
    // always switch back to FR regardless of active recognition locale.
    const mentionsFrenchInAnyScript =
        /(?:french|francais|français|\bfr\b|フランス語|フランス|フレンチ|フランチ|ふらんす|ふれんち|法语|法文|仏語|佛語)/i.test(
            raw
        ) || /(?:french|francais|\bfr\b)/i.test(normalized);
    if (mentionsFrenchInAnyScript) {
        return "fr";
    }

    // Japanese STT frequently outputs katakana for "in/en french".
    // Accept forms like "イン フレンチ" and "エン フランス語".
    const japaneseForceFrenchPattern =
        /(イン|エン)\s*(フランス語|フランス|フレンチ|フランセ|フランチ|仏語|佛語)/;
    if (japaneseForceFrenchPattern.test(raw)) {
        return "fr";
    }

    // Emergency fallback: allow simple keywords to force French from any locale.
    const forceFrench = FORCE_FRENCH_KEYWORDS.some((keyword) => {
        const kLower = keyword.toLowerCase();
        if (/[\u4e00-\u9fff]/.test(kLower)) {
            return rawLower.includes(kLower);
        }

        const normalizedKeyword = normalizeText(kLower);
        return (
            rawLower.includes(kLower) ||
            compactRawLower.includes(kLower.replace(/\s+/g, "")) ||
            (normalizedKeyword.length > 0 &&
                (normalized.includes(normalizedKeyword) ||
                    compactNormalized.includes(
                        normalizedKeyword.replace(/\s+/g, "")
                    )))
        );
    });

    if (forceFrench) {
        return "fr";
    }

    // Pattern: explicit command first ("en <langue>" / "in <language>")
    const explicitMatch = normalized.match(/\b(?:en|in)\s+([a-z\-]+)\b/);
    if (explicitMatch?.[1]) {
        const token = explicitMatch[1];
        const code = LANGUAGE_ALIASES[token];
        if (code) {
            return code;
        }
        // Explicit language request but unknown target: fallback to French.
        return "fr";
    }

    // Handle compact forms often produced by non-latin STT engines:
    // "infrench", "enjaponais", "inchinois", "inhebrew", "encoreen".
    const compactTargets: Array<{ code: string; tokens: string[] }> = [
        { code: "fr", tokens: ["francais", "french", "fr"] },
        {
            code: "ja",
            tokens: ["japonais", "japanese", "japan", "nihongo", "ja"],
        },
        {
            code: "zh",
            tokens: ["chinois", "chinese", "mandarin", "zh"],
        },
        { code: "he", tokens: ["hebreu", "hebrew", "he"] },
        { code: "ko", tokens: ["coreen", "korean", "ko"] },
    ];

    for (const target of compactTargets) {
        for (const token of target.tokens) {
            if (
                compactNormalized.includes(`en${token}`) ||
                compactNormalized.includes(`in${token}`)
            ) {
                return target.code;
            }
        }
    }

    // Allow short direct language names only when transcript is short,
    // so medical dictation text does not trigger locale switches by accident.
    const tokens = normalized.split(" ").filter(Boolean);
    const isShortUtterance = tokens.length > 0 && tokens.length <= 2;
    if (!isShortUtterance) {
        return null;
    }

    // Direct aliases first
    for (const [alias, code] of Object.entries(LANGUAGE_ALIASES)) {
        const aliasLower = alias.toLowerCase();

        // Non-latin aliases: allow contains matching for mixed transcripts
        // such as "en フランス語" or "switch フレンチ".
        if (/[^\x00-\x7F]/.test(aliasLower)) {
            if (rawLower.includes(aliasLower)) {
                return code;
            }
            continue;
        }

        if (
            rawLower === aliasLower ||
            hasAliasAsWholeWord(normalized, alias)
        ) {
            return code;
        }
    }

    return null;
};

const NAV_COMMANDS: NavCommand[] = [
    {
        label: "Rendez-vous",
        path: "/appointments",
        keywords: ["rendez vous", "rendez-vous", "rdv"],
    },
    {
        label: "Accueil",
        path: "/",
        keywords: [
            "retourne a la maison",
            "retour a la maison",
            "retour a l accueil",
            "retour a l'accueil",
            "retour a laccueil",
            "accueil",
            "maison",
            "home",
            "clinia",
        ],
    },
    {
        label: "Patients",
        path: "/patients",
        keywords: ["patients", "patient"],
    },
    {
        label: "Cliniques",
        path: "/cliniques",
        keywords: ["cliniques", "clinique"],
    },
    {
        label: "Specialistes",
        path: "/specialists",
        keywords: [
            "specialistes",
            "specialiste",
            "specialites",
            "specialite",
            "medecins",
            "medecin",
            "docteurs",
            "docteur",
        ],
    },
];

const ACTION_COMMANDS: ActionCommand[] = [
    {
        label: "Dictee",
        action: "dictation",
        keywords: [
            "dictee",
            "dicte",
            "dicter",
            "diagnostic",
            "dictation",
            "diagnosis",
        ],
        response: "Dites votre diagnostic.",
    },
    {
        label: "Rechercher",
        action: "execute",
        keywords: [
            "execute",
            "recherche",
            "rechercher",
            "lancer",
            "lancer requete",
            "lancer la requete",
            "lancer requête",
            "lancer la requête",
            "run query",
            "launch query",
            "search",
        ],
        response: "Recherche lancee.",
    },
    {
        label: "Effacer",
        action: "clear",
        keywords: [
            "efface",
            "effacer",
            "annule",
            "annuler",
            "vider",
            "nouveau diagnostic",
            "nouveau diagnostique",
            "nouveau diagnostik",
            "nouveau diag",
            "new diagnosis",
            "new diagnostic",
            "new diagnose",
            "new des annonces",
            "clear diagnosis",
            "reset diagnosis",
            "start over",
        ],
        response: "Diagnostic efface.",
    },
    {
        label: "Arret",
        action: "stop",
        keywords: ["arrete", "stop", "pause", "stop listening"],
        response: "Écoute arrêtée.",
    },
];

const LOCAL_VOICE_TEXT_BY_LANG: Record<
    string,
    {
        wakeReady: string;
        modeActive: string;
        returnHome: string;
        returnHomeInstruction: string;
        captured: string;
        followup: string;
        action: {
            dictation: string;
            execute: string;
            clear: string;
            stop: string;
        };
        navOpen: {
            appointments: string;
            home: string;
            patients: string;
            cliniques: string;
            specialists: string;
            unknown: string;
        };
    }
> = {
    fr: {
        wakeReady: "ClinIA pret, dictez votre diagnostic.",
        modeActive: "Mode vocal actif.",
        returnHome: "Retour a l'accueil.",
        returnHomeInstruction:
            "Dites ou ecrivez votre diagnostic, puis dites Lancer Requete ou cliquez sur Lancer Requete pour lancer.",
        captured: "Diagnostic capture.",
        followup:
            "Si satisfait, cliquez ou dites «Lancer Requete», ou dites «Nouveau diagnostic» pour recommencer.",
        action: {
            dictation: "Dites votre diagnostic.",
            execute: "Recherche lancee.",
            clear: "Diagnostic efface.",
            stop: "Ecoute arretee.",
        },
        navOpen: {
            appointments: "Ouverture rendez-vous.",
            home: "Ouverture accueil.",
            patients: "Ouverture patients.",
            cliniques: "Ouverture cliniques.",
            specialists: "Ouverture specialistes.",
            unknown: "Ouverture section.",
        },
    },
    en: {
        wakeReady: "ClinIA is ready, dictate your diagnosis.",
        modeActive: "Voice mode enabled.",
        returnHome: "Back to home.",
        returnHomeInstruction:
            "Please dictate or type your diagnosis, then say Run Query or click Run Query.",
        captured: "Diagnosis captured.",
        followup:
            "If satisfied, click or say 'Run Query', or say 'New diagnosis' to start over.",
        action: {
            dictation: "Please say your diagnosis.",
            execute: "Query started.",
            clear: "Diagnosis cleared.",
            stop: "Listening stopped.",
        },
        navOpen: {
            appointments: "Opening appointments.",
            home: "Opening home.",
            patients: "Opening patients.",
            cliniques: "Opening clinics.",
            specialists: "Opening specialists.",
            unknown: "Opening section.",
        },
    },
};

const getLocalVoiceText = (localeCode: string) => {
    const normalized = (localeCode || "fr").toLowerCase().slice(0, 2);
    return (
        LOCAL_VOICE_TEXT_BY_LANG[normalized] ||
        LOCAL_VOICE_TEXT_BY_LANG.en
    );
};

const getNavOpenPrompt = (
    localeCode: string,
    path: string
) => {
    const voiceText = getLocalVoiceText(localeCode);
    if (path === "/appointments") return voiceText.navOpen.appointments;
    if (path === "/") return voiceText.navOpen.home;
    if (path === "/patients") return voiceText.navOpen.patients;
    if (path === "/cliniques") return voiceText.navOpen.cliniques;
    if (path === "/specialists") return voiceText.navOpen.specialists;
    return voiceText.navOpen.unknown;
};

const getRecognitionLang = (localeCode: string) => {
    const normalized = (localeCode || "fr").toLowerCase().slice(0, 2);
    if (normalized === "en") return "en-US";
    if (normalized === "es") return "es-ES";
    if (normalized === "de") return "de-DE";
    if (normalized === "it") return "it-IT";
    if (normalized === "pt") return "pt-PT";
    if (normalized === "ja") return "ja-JP";
    if (normalized === "ko") return "ko-KR";
    if (normalized === "zh") return "zh-CN";
    return "fr-CA";
};

const getSpeechSynthesisLang = (localeCode: string) => {
    const normalized = (localeCode || "fr").toLowerCase().slice(0, 2);
    if (normalized === "en") return "en-US";
    if (normalized === "es") return "es-ES";
    if (normalized === "de") return "de-DE";
    if (normalized === "it") return "it-IT";
    if (normalized === "pt") return "pt-PT";
    if (normalized === "ja") return "ja-JP";
    if (normalized === "ko") return "ko-KR";
    if (normalized === "zh") return "zh-CN";

    // French: prefer Canadian French when user locale/timezone suggests Canada/Quebec.
    const browserLangs =
        typeof navigator !== "undefined"
            ? [navigator.language, ...(navigator.languages || [])]
            : [];

    const hasFrCaLocale = browserLangs.some((lang) =>
        String(lang || "").toLowerCase().startsWith("fr-ca")
    );

    let timezone = "";
    try {
        timezone =
            Intl.DateTimeFormat().resolvedOptions().timeZone?.toLowerCase() || "";
    } catch (e) {}

    const looksLikeCanadaTimezone =
        timezone.includes("america/montreal") ||
        timezone.includes("america/blanc-sablon") ||
        timezone.includes("america/toronto") ||
        timezone.includes("canada");

    if (hasFrCaLocale || looksLikeCanadaTimezone) {
        return "fr-CA";
    }

    return "fr-FR";
};

const pickBestVoiceForLang = (
    voices: SpeechSynthesisVoice[],
    targetLang: string
) => {
    if (!Array.isArray(voices) || voices.length === 0) {
        return null;
    }

    const canonicalizeLang = (value: string) =>
        String(value || "")
            .toLowerCase()
            .replace(/_/g, "-")
            .trim();

    const normalized = canonicalizeLang(targetLang);
    const base = normalized.slice(0, 2);

    const exact = voices.find(
        (v) => canonicalizeLang(v.lang || "") === normalized
    );
    if (exact) return exact;

    // Prefer Quebec/Canadian labeled voices when targeting fr-CA.
    if (normalized === "fr-ca") {
        const canadianFrench = voices.find((v) => {
            const vLang = canonicalizeLang(v.lang || "");
            const vName = String(v.name || "").toLowerCase();
            return (
                vLang.startsWith("fr-ca") ||
                vName.includes("quebec") ||
                vName.includes("quebecois") ||
                vName.includes("québec") ||
                vName.includes("canada")
            );
        });
        if (canadianFrench) return canadianFrench;
    }

    const sameBase = voices.find((v) =>
        canonicalizeLang(v.lang || "").startsWith(`${base}-`)
    );
    if (sameBase) return sameBase;

    if (base === "fr") {
        const frenchByName = voices.find((v) => {
            const vName = String(v.name || "").toLowerCase();
            return (
                vName.includes("french") ||
                vName.includes("francais") ||
                vName.includes("français")
            );
        });
        if (frenchByName) return frenchByName;
    }

    const looseBase = voices.find(
        (v) => canonicalizeLang(v.lang || "").slice(0, 2) === base
    );
    if (looseBase) return looseBase;

    return null;
};

const VoiceNavButton: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setLocaleFromVoice, isTranslating, locale } = useHomeI18n();
    // Vite exposes `import.meta.env.DEV` as `true` in development builds.
    // Keep the mic-test UI strictly for dev mode only.
    const isDev =
        typeof import.meta !== "undefined" &&
        (import.meta as any).env &&
        Boolean((import.meta as any).env.DEV);
    const [isListening, setIsListening] = useState(false);
    const [isHandsFree, setIsHandsFree] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [micLevel, setMicLevel] = useState<number | null>(null);
    const [isMicTestActive, setIsMicTestActive] = useState(false);
    const [voiceMode, setVoiceMode] = useState<"navigation" | "dictation">(
        "navigation"
    );
    const [wakeEnabled, setWakeEnabled] = useState<boolean>(() => {
        try {
            return (
                typeof window !== "undefined" &&
                window.localStorage.getItem("clinia_wake_enabled") === "1"
            );
        } catch (e) {
            return false;
        }
    });
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const startListeningRef = useRef<() => void>(() => {});
    const isHandsFreeRef = useRef(false);
    const isSpeakingRef = useRef(false);
    const isListeningRef = useRef(false);
    const lastStartAtRef = useRef<number>(0);
    const lastDictationRef = useRef<{ text: string; at: number } | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const micTestStreamRef = useRef<MediaStream | null>(null);
    const micTestIntervalRef = useRef<number | null>(null);
    const micTestAudioCtxRef = useRef<AudioContext | null>(null);
    const silenceTimerRef = useRef<number | null>(null);
    const silenceStopRef = useRef(false);
    const speechRequestSeqRef = useRef(0);
    const activeSpeechRequestRef = useRef(0);
    const lastSpokenRef = useRef<{ text: string; at: number } | null>(null);
    const lastCancelAtRef = useRef(0);
    const speechSoftTimerRef = useRef<number | null>(null);
    const speechHardTimerRef = useRef<number | null>(null);

    useEffect(() => {
        isHandsFreeRef.current = isHandsFree;
    }, [isHandsFree]);

    const isSupported = useMemo(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return (
            "SpeechRecognition" in window || "webkitSpeechRecognition" in window
        );
    }, []);

    const clearSpeechTimers = useCallback(() => {
        if (speechSoftTimerRef.current) {
            window.clearTimeout(speechSoftTimerRef.current);
            speechSoftTimerRef.current = null;
        }
        if (speechHardTimerRef.current) {
            window.clearTimeout(speechHardTimerRef.current);
            speechHardTimerRef.current = null;
        }
    }, []);

    const speak = useCallback(
        (
            text: string,
            options?: {
                restartListening?: boolean;
                onDone?: () => void;
                interrupt?: boolean;
                localeOverride?: string;
            }
        ) => {
        if (typeof window === "undefined") return;
        if (!("speechSynthesis" in window)) return;

        const restartListening = options?.restartListening ?? true;
        const onDone = options?.onDone;
        const shouldInterrupt = options?.interrupt ?? true;

        // Anti-double-fire: ignore duplicate prompt bursts.
        const now = Date.now();
        const normalizedText = normalizeText(text);
        const lastSpoken = lastSpokenRef.current;
        if (
            lastSpoken &&
            lastSpoken.text === normalizedText &&
            now - lastSpoken.at < 900
        ) {
            return;
        }
        lastSpokenRef.current = { text: normalizedText, at: now };

        const requestId = ++speechRequestSeqRef.current;
        activeSpeechRequestRef.current = requestId;

        const safeCancel = () => {
            const cancelNow = Date.now();
            // Anti-cancel sauvage: throttle aggressive cancel loops.
            if (cancelNow - lastCancelAtRef.current < 250) {
                return;
            }
            lastCancelAtRef.current = cancelNow;
            try {
                window.speechSynthesis.cancel();
            } catch (e) {}
        };

        if (shouldInterrupt) {
            safeCancel();
        }
        clearSpeechTimers();

        const playBeep = () => {
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioCtx) return;
                const ac = new AudioCtx();
                const o = ac.createOscillator();
                const g = ac.createGain();
                o.type = "sine";
                o.frequency.value = 880;
                g.gain.value = 0.03;
                o.connect(g);
                g.connect(ac.destination);
                o.start();
                setTimeout(() => {
                    try {
                        o.stop();
                        ac.close();
                    } catch (e) {}
                }, 180);
            } catch (e) {}
        };

        let cleanedUp = false;
        const cleanupAfterSpeak = () => {
            // Ignore stale callbacks from older utterances.
            if (requestId !== activeSpeechRequestRef.current) {
                return;
            }
            if (cleanedUp) {
                return;
            }
            cleanedUp = true;
            clearSpeechTimers();
            isSpeakingRef.current = false;
            if (restartListening && isHandsFreeRef.current && !isListeningRef.current) {
                startListeningRef.current();
            }
            if (onDone) {
                try {
                    onDone();
                } catch (e) {}
            }
        };

        const utterance = new SpeechSynthesisUtterance(text);
        const effectiveLocale = options?.localeOverride || locale;
        const ttsLang = getSpeechSynthesisLang(effectiveLocale);
        utterance.lang = ttsLang;
        utterance.volume = 1;
        utterance.rate = 1;
        utterance.pitch = 1;
        isSpeakingRef.current = true;

        // iOS/Safari can be slower to trigger speech callbacks. Avoid short fixed timers
        // that can cut prompts and cause perceived clipping.
        const estimatedMs = Math.max(3000, Math.min(9000, text.length * 85));
        speechSoftTimerRef.current = window.setTimeout(() => {
            try {
                // Anti-queue bloquee: if synthesis no longer speaks and callback was missed,
                // recover by finalizing this request.
                if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
                    cleanupAfterSpeak();
                }
            } catch (e) {
                cleanupAfterSpeak();
            }
        }, estimatedMs);
        speechHardTimerRef.current = window.setTimeout(() => {
            // Hard watchdog: force recovery if queue is stuck or callbacks never fired.
            try {
                safeCancel();
            } catch (e) {}
            cleanupAfterSpeak();
        }, estimatedMs + 5000);

        utterance.onend = () => {
            cleanupAfterSpeak();
        };
        utterance.onerror = () => {
            cleanupAfterSpeak();
        };

        const speakNow = (voicesList?: SpeechSynthesisVoice[]) => {
            try {
                const selectedVoice = pickBestVoiceForLang(
                    voicesList || window.speechSynthesis.getVoices(),
                    ttsLang
                );
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                    utterance.lang = selectedVoice.lang || ttsLang;
                } else {
                    utterance.voice = null;
                    utterance.lang = ttsLang;
                }

                if (isDev) {
                    console.info("[VoiceNav] tts voice", {
                        locale,
                        effectiveLocale,
                        targetLang: ttsLang,
                        selectedName: selectedVoice?.name || null,
                        selectedLang: selectedVoice?.lang || utterance.lang,
                    });
                }

                recognitionRef.current?.stop();
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                cleanupAfterSpeak();
                playBeep();
            }
        };

        let didStartSpeak = false;
        const startSpeakOnce = (voicesList?: SpeechSynthesisVoice[]) => {
            if (didStartSpeak) {
                return;
            }
            didStartSpeak = true;
            speakNow(voicesList);
        };

        try {
            const voices = window.speechSynthesis.getVoices();
            if (!voices || voices.length === 0) {
                const onVoicesChanged = () => {
                    try {
                        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
                    } catch (e) {}
                    startSpeakOnce(window.speechSynthesis.getVoices());
                };
                try {
                    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
                } catch (e) {}
                window.speechSynthesis.getVoices();
                setTimeout(() => {
                    try {
                        try {
                            window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
                        } catch (e) {}
                        // Fallback: even without loaded voice list, speak with browser default voice.
                        startSpeakOnce(window.speechSynthesis.getVoices());
                    } catch (e) {}
                }, 700);
            } else {
                startSpeakOnce(voices);
            }
        } catch (e) {
            clearSpeechTimers();
            isSpeakingRef.current = false;
            playBeep();
            if (isHandsFreeRef.current && !isListeningRef.current) {
                startListeningRef.current();
            }
        }
    }, [clearSpeechTimers, locale]);

    useEffect(() => {
        return () => {
            clearSpeechTimers();
        };
    }, [clearSpeechTimers]);

    // On some mobile browsers (Safari/iOS) audio and speechSynthesis are locked
    // until a user gesture occurs. Add a one-time unlock handler that will be
    // triggered on the first touch/click so TTS and AudioContext can be used.
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const unlocked = window.localStorage.getItem("clinia_audio_unlocked");
            if (unlocked === "1") return;
        } catch (e) {}

        const unlock = () => {
            try {
                // Try to load voices (allowed in user gesture)
                if (window.speechSynthesis) {
                    window.speechSynthesis.getVoices();
                }
            } catch (e) {}
            try {
                // Create/resume a short AudioContext to satisfy autoplay policies
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                    const ac = new AudioCtx();
                    if (ac.state === "suspended" && typeof ac.resume === "function") {
                        ac.resume().catch(() => {});
                    }
                    // Play an inaudible buffer to ensure the audio output is unlocked
                    try {
                        const o = ac.createOscillator();
                        const g = ac.createGain();
                        o.type = "sine";
                        o.frequency.value = 220;
                        g.gain.value = 0.0001;
                        o.connect(g);
                        g.connect(ac.destination);
                        o.start();
                        setTimeout(() => {
                            try {
                                o.stop();
                            } catch (e) {}
                            try {
                                ac.close();
                            } catch (e) {}
                        }, 50);
                    } catch (e) {
                        try {
                            ac.close();
                        } catch (e) {}
                    }
                }
            } catch (e) {}
            try {
                window.localStorage.setItem("clinia_audio_unlocked", "1");
            } catch (e) {}
            // remove listeners after first unlock
            try {
                window.removeEventListener("touchstart", unlock);
            } catch (e) {}
            try {
                window.removeEventListener("click", unlock);
            } catch (e) {}
        };

        window.addEventListener("touchstart", unlock, { once: true, passive: true });
        window.addEventListener("click", unlock, { once: true, passive: true });

        return () => {
            try {
                window.removeEventListener("touchstart", unlock);
            } catch (e) {}
            try {
                window.removeEventListener("click", unlock);
            } catch (e) {}
        };
    }, []);

    const handleTranscript = useCallback(
        (transcript: string) => {
            const localVoiceText = getLocalVoiceText(locale);
            const normalized = normalizeText(transcript);
            const compactNormalized = normalized.replace(/\s+/g, "");
            const isWakeWord = compactNormalized.includes("clinia");
            const requestedLocale = detectLocaleFromTranscript(transcript);
            // Robust detection for "diagnostic" with common variants.
            const DIAGNOSTIC_VARIANTS = [
                "diagnostic",
                "diagnostique",
                "diagnostik",
                "diag",
            ];
            const isDiagnosticWord = DIAGNOSTIC_VARIANTS.some((kw) => {
                const plain = kw.toLowerCase();
                return (
                    normalized.includes(plain) ||
                    compactNormalized.includes(plain.replace(/\s+/g, ""))
                );
            });

            // Short debug log to help testing — shows whether the word was detected.
            // Leave this in during local dev; remove if noisy.
            if (typeof console !== "undefined") {
                console.info("[VoiceNav] diagnostic check", {
                    transcript,
                    normalized,
                    compactNormalized,
                    isDiagnosticWord,
                });
            }

            setStatus(`Entendu: "${transcript}"`);
            if (isDev && typeof window !== "undefined") {
                console.info("[VoiceNav] transcript", {
                    raw: transcript,
                    normalized,
                    compactNormalized,
                    voiceMode,
                    path: location.pathname,
                });
            }

            if (isWakeWord) {
                setStatus("Navigation: Accueil");
                // Clear previous diagnostic and mark we're waiting for dictation
                try {
                    window.localStorage.setItem("clinia_waiting_dictation", "1");
                } catch (e) {}
                try {
                    window.dispatchEvent(new CustomEvent("clinia:voice-clear"));
                } catch (e) {}
                try {
                    window.dispatchEvent(new CustomEvent("clinia:voice-start"));
                } catch (e) {}
                navigate("/");
                setVoiceMode("dictation");
                speak(localVoiceText.wakeReady);
                return;
            }

            if (requestedLocale) {
                const localeLabel = requestedLocale.toUpperCase();
                setStatus(`Traduction de l'accueil (${localeLabel})...`);
                setLocaleFromVoice(requestedLocale)
                    .then(
                        ({
                            voiceAck,
                            dictationInstruction,
                        }: {
                            voiceAck: string;
                            dictationInstruction: string;
                        }) => {
                        navigate("/");
                        setVoiceMode("dictation");
                        setIsHandsFree(true);
                        isHandsFreeRef.current = true;
                        try {
                            window.localStorage.setItem("clinia_waiting_dictation", "1");
                        } catch (e) {}
                        try {
                            window.dispatchEvent(new CustomEvent("clinia:voice-clear"));
                        } catch (e) {}
                        try {
                            window.dispatchEvent(new CustomEvent("clinia:voice-start"));
                        } catch (e) {}

                        if (requestedLocale === "fr") {
                            setStatus("Accueil en francais.");
                        } else {
                            setStatus(`Accueil traduit (${localeLabel}).`);
                        }
                        speak(voiceAck, {
                            interrupt: true,
                            restartListening: false,
                            localeOverride: requestedLocale,
                            onDone: () => {
                                speak(dictationInstruction, {
                                    localeOverride: requestedLocale,
                                });
                            },
                        });
                    }
                    )
                    .catch(() => {
                        setStatus("Langue non reconnue, retour au francais.");
                        setLocaleFromVoice("fr")
                            .then(
                                ({
                                    voiceAck,
                                    dictationInstruction,
                                }: {
                                    voiceAck: string;
                                    dictationInstruction: string;
                                }) => {
                                navigate("/");
                                setVoiceMode("dictation");
                                setIsHandsFree(true);
                                isHandsFreeRef.current = true;
                                try {
                                    window.localStorage.setItem("clinia_waiting_dictation", "1");
                                } catch (e) {}
                                try {
                                    window.dispatchEvent(new CustomEvent("clinia:voice-clear"));
                                } catch (e) {}
                                try {
                                    window.dispatchEvent(new CustomEvent("clinia:voice-start"));
                                } catch (e) {}

                                speak(voiceAck, {
                                    interrupt: true,
                                    restartListening: false,
                                    localeOverride: "fr",
                                    onDone: () => {
                                        speak(dictationInstruction, {
                                            localeOverride: "fr",
                                        });
                                    },
                                });
                            }
                            )
                            .catch(() => {
                                speak(localVoiceText.returnHome, {
                                    interrupt: true,
                                    restartListening: false,
                                    localeOverride: "fr",
                                    onDone: () => {
                                        speak(localVoiceText.returnHomeInstruction, {
                                            localeOverride: "fr",
                                        });
                                    },
                                });
                            });
                    });
                return;
            }

            // If user says "diagnostic", navigate home and activate dictation mode.
            if (isDiagnosticWord) {
                setStatus("Activation du mode dictée...");
                navigate("/");
                setVoiceMode("dictation");
                // Enable hands-free so speak() will restart listening after the prompt.
                setIsHandsFree(true);
                isHandsFreeRef.current = true;
                // Notify other components that dictation is expected (disable search button).
                // Persist a flag in localStorage before navigation so freshly mounted components
                // will see the waiting state even if they mount after navigation.
                try {
                    window.localStorage.setItem("clinia_waiting_dictation", "1");
                } catch (e) {}
                try {
                    window.dispatchEvent(new CustomEvent("clinia:voice-clear"));
                } catch (e) {}
                try {
                    window.dispatchEvent(new CustomEvent("clinia:voice-start"));
                } catch (e) {}
                // Short prompt
                speak(localVoiceText.returnHomeInstruction);
                return;
            }
            const matchedNav = NAV_COMMANDS.find((command) =>
                command.keywords.some((keyword) =>
                    normalized.includes(normalizeText(keyword))
                )
            );

            if (matchedNav) {
                setStatus(`Navigation: ${matchedNav.label}`);
                navigate(matchedNav.path);
                if (matchedNav.path === "/") {
                    setVoiceMode("dictation");
                    // Clear previous diagnostic and set waiting state when returning home
                    try {
                        window.localStorage.setItem("clinia_waiting_dictation", "1");
                    } catch (e) {}
                    try {
                        window.dispatchEvent(new CustomEvent("clinia:voice-clear"));
                    } catch (e) {}
                    try {
                        window.dispatchEvent(new CustomEvent("clinia:voice-start"));
                    } catch (e) {}
                    if (normalized.includes("clinia")) {
                        speak(localVoiceText.wakeReady);
                    } else {
                        // Chain prompts on actual speech end to avoid clipping on iOS.
                        speak(localVoiceText.returnHome, {
                            restartListening: false,
                            onDone: () => {
                                speak(localVoiceText.returnHomeInstruction);
                            },
                        });
                    }
                } else {
                    setVoiceMode("navigation");
                    speak(getNavOpenPrompt(locale, matchedNav.path));
                }
                return;
            }

            const matchedAction = ACTION_COMMANDS.find((command) =>
                command.keywords.some((keyword) =>
                    normalized.includes(normalizeText(keyword))
                )
            );

            if (matchedAction) {
                setStatus(`Commande: ${matchedAction.label}`);
                if (matchedAction.action === "dictation") {
                    setVoiceMode("dictation");
                    speak(localVoiceText.action.dictation);
                    return;
                }
                if (matchedAction.action === "execute") {
                    window.dispatchEvent(
                        new CustomEvent("clinia:voice-execute")
                    );
                    speak(localVoiceText.action.execute);
                    return;
                }
                if (matchedAction.action === "clear") {
                    window.dispatchEvent(
                        new CustomEvent("clinia:voice-clear")
                    );
                    speak(localVoiceText.action.clear);
                    return;
                }
                if (matchedAction.action === "stop") {
                    recognitionRef.current?.stop();
                    setIsHandsFree(false);
                    isHandsFreeRef.current = false;
                    setIsListening(false);
                    isListeningRef.current = false;
                    setStatus(localVoiceText.action.stop);
                    speak(localVoiceText.action.stop);
                    return;
                }
            }

            if (voiceMode === "dictation" || location.pathname === "/") {
                const now = Date.now();
                const last = lastDictationRef.current;
                if (last && last.text === normalized && now - last.at < 2000) {
                    setStatus("Diagnostic capture.");
                    return;
                }
                lastDictationRef.current = { text: normalized, at: now };
                (window as any).__cliniaLastDictation = transcript;
                window.dispatchEvent(
                    new CustomEvent("clinia:voice-dictation", {
                        detail: { text: transcript },
                    })
                );
                setVoiceMode("dictation");
                setStatus("Diagnostic capture.");
                speak(localVoiceText.captured, {
                    restartListening: false,
                    onDone: () => {
                        if (typeof console !== "undefined") {
                            console.info("[VoiceNav] speaking follow-up instruction");
                        }
                        speak(localVoiceText.followup);
                    },
                });
                return;
            }

            setStatus(`Commande non reconnue: "${transcript}"`);
        },
        [location.pathname, locale, navigate, speak, voiceMode]
    );

    const createRecognition = useCallback(() => {
        const SpeechRecognitionCtor =
            window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
            return null;
        }
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = getRecognitionLang(locale);
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        (recognition as SpeechRecognition & { continuous?: boolean }).continuous =
            false;
        recognition.onstart = () => {
            setStatus("Micro actif, parlez maintenant...");
            if (isDev) {
                console.info("[VoiceNav] recognition start");
            }
            if (silenceTimerRef.current) {
                window.clearTimeout(silenceTimerRef.current);
            }
            silenceTimerRef.current = window.setTimeout(() => {
                silenceStopRef.current = true;
                recognition.stop();
            }, 30000);
        };
        recognition.onaudiostart = () => {
            if (isDev) {
                console.info("[VoiceNav] audio start");
            }
        };
        recognition.onaudioend = () => {
            if (isDev) {
                console.info("[VoiceNav] audio end");
            }
        };
        recognition.onspeechstart = () => {
            if (isDev) {
                console.info("[VoiceNav] speech start");
            }
            if (silenceTimerRef.current) {
                window.clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
        };
        recognition.onspeechend = () => {
            if (isDev) {
                console.info("[VoiceNav] speech end");
            }
            if (silenceTimerRef.current) {
                window.clearTimeout(silenceTimerRef.current);
            }
            silenceTimerRef.current = window.setTimeout(() => {
                silenceStopRef.current = true;
                recognition.stop();
            }, 30000);
        };
        recognition.onresult = (event) => {
            // Prefer the newest final result and inspect alternatives.
            // This avoids missing intent when top hypothesis is unstable
            // (common with cross-language commands like "In French").
            const candidates: string[] = [];

            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const result = event.results[i];
                if (!result?.isFinal) {
                    continue;
                }
                for (let j = 0; j < result.length; j += 1) {
                    const alt = result[j]?.transcript?.trim();
                    if (alt) {
                        candidates.push(alt);
                    }
                }
            }

            if (candidates.length === 0) {
                const fallback =
                    event.results[event.resultIndex]?.[0]?.transcript ||
                    event.results[0]?.[0]?.transcript ||
                    "";
                if (fallback.trim()) {
                    handleTranscript(fallback.trim());
                }
                return;
            }

            // If one alternative maps to a language command, use it directly.
            const localeCandidate = candidates.find(
                (candidate) => detectLocaleFromTranscript(candidate) !== null
            );

            handleTranscript(localeCandidate || candidates[0]);
        };
        recognition.onnomatch = () => {
            setStatus("Aucune reconnaissance vocale.");
            if (isDev) {
                console.info("[VoiceNav] no match");
            }
        };
        recognition.onerror = (event) => {
            if (event.error === "audio-capture") {
                setStatus(
                    "Micro non accessible. Verifiez les permissions du navigateur et de l'OS."
                );
            } else {
                // Treat common transient errors (no-speech) specially when hands-free is enabled
                if (event.error === "no-speech") {
                    setStatus("Aucune parole détectée.");
                    if (isDev) {
                        console.info("[VoiceNav] recognition no-speech");
                    }
                    if (isHandsFreeRef.current) {
                        // Attempt to restart listening shortly after a transient no-speech
                        window.setTimeout(() => {
                            try {
                                startListeningRef.current();
                            } catch (e) {
                                /* ignore */
                            }
                        }, 500);
                        return;
                    } else {
                        setStatus("Aucune parole détectée.");
                        setIsListening(false);
                        isListeningRef.current = false;
                        return;
                    }
                }

                setStatus(`Erreur vocale: ${event.error}`);
            }
            if (isDev) {
                console.error("[VoiceNav] recognition error", event.error);
            }
            if (silenceTimerRef.current) {
                window.clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
            setIsListening(false);
            isListeningRef.current = false;
        };
        recognition.onend = () => {
            if (isDev) {
                console.info("[VoiceNav] recognition end");
            }
            if (silenceTimerRef.current) {
                window.clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
            setIsListening(false);
            isListeningRef.current = false;
            if (silenceStopRef.current) {
                silenceStopRef.current = false;
                setIsHandsFree(false);
                isHandsFreeRef.current = false;
                setStatus("Ecoute arretee (silence).");
                return;
            }
            if (isSpeakingRef.current) {
                return;
            }
            if (isHandsFreeRef.current) {
                startListeningRef.current();
            }
        };
        return recognition;
    }, [handleTranscript, locale]);

    // Try to auto-enable persistent wake if previously enabled.
    useEffect(() => {
        if (!wakeEnabled) return;
        if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
        // Attempt to acquire media silently; browser may reuse prior permission.
        navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
                if (micStreamRef.current) {
                    micStreamRef.current.getTracks().forEach((t) => t.stop());
                }
                micStreamRef.current = stream;
                setIsHandsFree(true);
                isHandsFreeRef.current = true;
                // start listening if possible
                try {
                    startListeningRef.current();
                } catch (e) {
                    /* ignore */
                }
            })
            .catch(() => {
                // If permission revoked, clear stored preference
                try {
                    window.localStorage.removeItem("clinia_wake_enabled");
                } catch (e) {}
                setWakeEnabled(false);
            });
    }, [wakeEnabled]);

    const enablePersistentWake = useCallback(() => {
        if (typeof navigator === "undefined" || !navigator.mediaDevices) {
            setStatus("API micro indisponible sur ce navigateur.");
            return;
        }
        navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
                if (micStreamRef.current) {
                    micStreamRef.current.getTracks().forEach((t) => t.stop());
                }
                micStreamRef.current = stream;
                setIsHandsFree(true);
                isHandsFreeRef.current = true;
                setWakeEnabled(true);
                try {
                    window.localStorage.setItem("clinia_wake_enabled", "1");
                } catch (e) {}
                setStatus("Écoute persistante activée.");
                // start listening right away
                startListeningRef.current();
            })
            .catch((err) => {
                setStatus(`Autorisation micro refusée: ${err?.name || "inconnu"}`);
            });
    }, []);

    const disablePersistentWake = useCallback(() => {
        recognitionRef.current?.stop();
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((t) => t.stop());
            micStreamRef.current = null;
        }
        setIsHandsFree(false);
        isHandsFreeRef.current = false;
        setWakeEnabled(false);
        try {
            window.localStorage.removeItem("clinia_wake_enabled");
        } catch (e) {}
        setStatus("Écoute persistante désactivée.");
    }, []);

    const startListening = useCallback(() => {
        console.info("[VoiceNav] startListening invoked");
        // Cooldown to avoid rapid restart loops (e.g. no-speech -> restart -> no-speech)
        const START_COOLDOWN_MS = 1000;
        const now = Date.now();
        if (now - (lastStartAtRef.current || 0) < START_COOLDOWN_MS) {
            if (isDev) {
                console.info("[VoiceNav] startListening suppressed by cooldown");
            }
            return;
        }
        lastStartAtRef.current = now;
        if (isListeningRef.current) {
            return;
        }
        const recognition = createRecognition();
        if (!recognition) {
            setStatus("Navigation vocale indisponible.");
            return;
        }
        recognitionRef.current = recognition;
        setStatus("Ecoute en cours...");
        setIsListening(true);
        isListeningRef.current = true;
        const startRecognition = () => {
            try {
                recognition.start();
            } catch (error) {
                console.error("[VoiceNav] start error", error);
                setStatus("Erreur de demarrage micro.");
                setIsListening(false);
                isListeningRef.current = false;
            }
        };
        if (typeof window === "undefined" || !navigator.mediaDevices) {
            setStatus("API micro indisponible. Essayez Chrome/HTTPS/localhost.");
            startRecognition();
            return;
        }
        navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
                const audioInputs = devices.filter(
                    (device) => device.kind === "audioinput"
                );
                if (isDev) {
                    console.info("[VoiceNav] audio inputs", audioInputs.length);
                }
            })
            .catch((error) => {
                if (isDev) {
                    console.info("[VoiceNav] enumerateDevices error", error);
                }
            });
        navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
                if (micStreamRef.current) {
                    micStreamRef.current.getTracks().forEach((track) =>
                        track.stop()
                    );
                }
                micStreamRef.current = stream;
                console.info("[VoiceNav] getUserMedia success, starting recognition");
                startRecognition();
            })
            .catch((error) => {
                if (isDev) {
                    console.error("[VoiceNav] getUserMedia error", error);
                }
                setStatus(
                    `Micro non accessible: ${error?.name || "inconnu"}.`
                );
                setIsListening(false);
                isListeningRef.current = false;
            });
    }, [createRecognition]);

    useEffect(() => {
        startListeningRef.current = startListening;
    }, [startListening]);

    const toggleListening = () => {
        console.info("[VoiceNav] toggleListening, isHandsFree=", isHandsFree, "isListening=", isListening);
        if (!isSupported) {
            setStatus("Navigation vocale non supportee sur ce navigateur.");
            return;
        }

        if (isHandsFree) {
            recognitionRef.current?.stop();
            if (silenceTimerRef.current) {
                window.clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
            silenceStopRef.current = false;
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach((track) =>
                    track.stop()
                );
                micStreamRef.current = null;
            }
            isListeningRef.current = false;
            setIsListening(false);
            setIsHandsFree(false);
            isHandsFreeRef.current = false;
            setStatus("Ecoute arretee.");
            return;
        }

        setIsHandsFree(true);
        isHandsFreeRef.current = true;
        console.info("[VoiceNav] hands-free enabled");
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.getVoices();
            speak(getLocalVoiceText(locale).modeActive);
            return;
        }
        startListening();
    };

    const stopMicTest = () => {
        if (micTestIntervalRef.current) {
            window.clearInterval(micTestIntervalRef.current);
            micTestIntervalRef.current = null;
        }
        if (micTestStreamRef.current) {
            micTestStreamRef.current.getTracks().forEach((track) =>
                track.stop()
            );
            micTestStreamRef.current = null;
        }
        if (micTestAudioCtxRef.current) {
            micTestAudioCtxRef.current.close();
            micTestAudioCtxRef.current = null;
        }
        setIsMicTestActive(false);
        setMicLevel(null);
    };

    const toggleMicTest = () => {
        if (isMicTestActive) {
            stopMicTest();
            return;
        }
        if (!isDev) {
            return;
        }
        if (typeof window === "undefined" || !navigator.mediaDevices) {
            setStatus("API micro indisponible. Essayez Chrome/HTTPS/localhost.");
            return;
        }
        navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
                const AudioCtx =
                    window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioCtx) {
                    setStatus("AudioContext indisponible.");
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                micTestStreamRef.current = stream;
                const audioCtx = new AudioCtx();
                micTestAudioCtxRef.current = audioCtx;
                const source = audioCtx.createMediaStreamSource(stream);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 1024;
                const data = new Uint8Array(analyser.fftSize);
                source.connect(analyser);
                micTestIntervalRef.current = window.setInterval(() => {
                    analyser.getByteTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i += 1) {
                        const v = (data[i] - 128) / 128;
                        sum += v * v;
                    }
                    const rms = Math.sqrt(sum / data.length);
                    setMicLevel(Math.min(100, Math.round(rms * 200)));
                }, 100);
                setIsMicTestActive(true);
                setStatus("Test micro actif.");
            })
            .catch((error) => {
                if (isDev) {
                    console.error("[VoiceNav] mic test error", error);
                }
                setStatus(
                    `Test micro impossible: ${error?.name || "inconnu"}.`
                );
                stopMicTest();
            });
    };

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={toggleListening}
                className={
                    "inline-flex h-9 w-9 items-center justify-center rounded-full border transition " +
                    (isListening
                        ? "border-red-200 bg-red-50 text-red-700"
                        : isHandsFree
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 text-gray-700 hover:bg-gray-50")
                }
                title="Dire: ouvre la page des rendez-vous, patients, cliniques, specialistes; retourne a la maison; execute; efface; arrete"
                aria-label={isHandsFree ? "Désactiver mode vocal" : "Activer mode vocal"}
            >
                {isTranslating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : isHandsFree ? (
                    <Mic className={"h-4 w-4 " + (isListening ? "animate-pulse" : "")} />
                ) : (
                    <MicOff className="h-4 w-4" />
                )}
            </button>
            {isDev && (
                <button
                    type="button"
                    onClick={toggleMicTest}
                    className={
                        "inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs transition " +
                        (isMicTestActive
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 text-gray-700 hover:bg-gray-50")
                    }
                    title="Test rapide du micro (niveau sonore)"
                >
                    {isMicTestActive ? "Test micro actif" : "Tester micro"}
                </button>
            )}
            {isDev && micLevel !== null && (
                <span className="text-xs text-gray-500">
                    Niveau micro: {micLevel}%
                </span>
            )}
            {isSupported && (
                <button
                    type="button"
                    onClick={() => {
                        if (wakeEnabled) disablePersistentWake();
                        else enablePersistentWake();
                    }}
                    className={
                        "inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs transition " +
                        (wakeEnabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 text-gray-700 hover:bg-gray-50")
                    }
                    title={wakeEnabled ? "Désactiver écoute persistante" : "Activer écoute persistante"}
                >
                    {wakeEnabled ? "Écoute persistante: ON" : "Activer écoute persistante"}
                </button>
            )}
            {status && (
                <span className="text-xs text-gray-500" aria-live="polite">
                    {status}
                </span>
            )}
        </div>
    );
};

export default VoiceNavButton;
