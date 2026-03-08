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
        .normalize("NFD")
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
    castillan: "es",
    castellano: "es",
    es: "es",
    // Native scripts
    日本語: "ja",
    中文: "zh",
    漢語: "zh",
    汉语: "zh",
    deutschsprache: "de",
};

const detectLocaleFromTranscript = (transcript: string): string | null => {
    const raw = (transcript || "").trim();
    if (!raw) {
        return null;
    }

    const rawLower = raw.toLowerCase();
    const normalized = normalizeText(rawLower);

    // Direct aliases first
    for (const [alias, code] of Object.entries(LANGUAGE_ALIASES)) {
        if (
            rawLower.includes(alias.toLowerCase()) ||
            normalized.includes(normalizeText(alias))
        ) {
            return code;
        }
    }

    // Pattern: "en <langue>" / "in <language>"
    const match = normalized.match(/\b(?:en|in)\s+([a-z\-]+)\b/);
    if (match?.[1]) {
        const token = match[1];
        const code = LANGUAGE_ALIASES[token];
        if (code) {
            return code;
        }
        // Explicit language request but unknown target: fallback to French.
        return "fr";
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
        keywords: ["dictee", "dicte", "dicter", "diagnostic"],
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
        ],
        response: "Diagnostic efface.",
    },
    {
        label: "Arret",
        action: "stop",
        keywords: ["arrete", "stop", "pause"],
        response: "Écoute arrêtée.",
    },
];

const VoiceNavButton: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setLocaleFromVoice, isTranslating } = useHomeI18n();
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
        utterance.lang = "fr-CA";
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

        const speakNow = () => {
            try {
                recognitionRef.current?.stop();
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                cleanupAfterSpeak();
                playBeep();
            }
        };

        try {
            const voices = window.speechSynthesis.getVoices();
            if (!voices || voices.length === 0) {
                const onVoicesChanged = () => {
                    try {
                        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
                    } catch (e) {}
                    speakNow();
                };
                try {
                    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
                } catch (e) {}
                window.speechSynthesis.getVoices();
                setTimeout(() => {
                    try {
                        const after = window.speechSynthesis.getVoices();
                        if (!after || after.length === 0) {
                            try {
                                window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
                            } catch (e) {}
                            clearSpeechTimers();
                            isSpeakingRef.current = false;
                            playBeep();
                            if (isHandsFreeRef.current && !isListeningRef.current) {
                                startListeningRef.current();
                            }
                        }
                    } catch (e) {}
                }, 700);
            } else {
                speakNow();
            }
        } catch (e) {
            clearSpeechTimers();
            isSpeakingRef.current = false;
            playBeep();
            if (isHandsFreeRef.current && !isListeningRef.current) {
                startListeningRef.current();
            }
        }
    }, [clearSpeechTimers]);

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
                speak("ClinIA pret, dictez votre diagnostic.");
                return;
            }

            if (requestedLocale) {
                const localeLabel = requestedLocale.toUpperCase();
                setStatus(`Traduction de l'accueil (${localeLabel})...`);
                setLocaleFromVoice(requestedLocale)
                    .then(() => {
                        if (requestedLocale === "fr") {
                            setStatus("Accueil en français.");
                            speak("Retour au français.", {
                                interrupt: true,
                            });
                            return;
                        }
                        setStatus(`Accueil traduit (${localeLabel}).`);
                        speak("Home page translated.", {
                            interrupt: true,
                        });
                    })
                    .catch(() => {
                        setStatus("Langue non reconnue, retour au français.");
                        setLocaleFromVoice("fr").catch(() => {});
                        speak("Translation failed.");
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
                speak("Dites ou ecrivez votre diagnostic.");
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
                        speak("ClinIA pret, dictez votre diagnostic.");
                    } else {
                        // Chain prompts on actual speech end to avoid clipping on iOS.
                        speak("Retour a l'accueil.", {
                            restartListening: false,
                            onDone: () => {
                                speak(
                                    "Dites ou écrivez votre diagnostic, puis dites «Lancer Requete» ou cliquez sur «Lancer Requete» pour lancer."
                                );
                            },
                        });
                    }
                } else {
                    setVoiceMode("navigation");
                    speak(`Ouverture ${matchedNav.label}.`);
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
                    speak(matchedAction.response);
                    return;
                }
                if (matchedAction.action === "execute") {
                    window.dispatchEvent(
                        new CustomEvent("clinia:voice-execute")
                    );
                    speak(matchedAction.response);
                    return;
                }
                if (matchedAction.action === "clear") {
                    window.dispatchEvent(
                        new CustomEvent("clinia:voice-clear")
                    );
                    speak(matchedAction.response);
                    return;
                }
                if (matchedAction.action === "stop") {
                    recognitionRef.current?.stop();
                    setIsHandsFree(false);
                    isHandsFreeRef.current = false;
                    setIsListening(false);
                    isListeningRef.current = false;
                    setStatus(matchedAction.response);
                    speak(matchedAction.response);
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
                speak("Diagnostic capturé.", {
                    restartListening: false,
                    onDone: () => {
                        if (typeof console !== "undefined") {
                            console.info("[VoiceNav] speaking follow-up instruction");
                        }
                        speak(
                            "Si satisfait, cliquez ou dites «Lancer Requete», ou dites «Nouveau diagnostic" +
                                "" + " pour recommencer."
                        );
                    },
                });
                return;
            }

            setStatus(`Commande non reconnue: "${transcript}"`);
        },
        [location.pathname, navigate, speak, voiceMode]
    );

    const createRecognition = useCallback(() => {
        const SpeechRecognitionCtor =
            window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
            return null;
        }
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = "fr-CA";
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
            const transcript = event.results[0][0].transcript;
            handleTranscript(transcript);
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
    }, [handleTranscript]);

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
            speak("Mode vocal actif.");
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
