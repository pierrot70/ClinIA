import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
        keywords: ["execute", "recherche", "rechercher", "lancer"],
        response: "Recherche lancee.",
    },
    {
        label: "Effacer",
        action: "clear",
        keywords: ["efface", "effacer", "annule", "annuler", "vider"],
        response: "Diagnostic efface.",
    },
    {
        label: "Arret",
        action: "stop",
        keywords: ["arrete", "stop", "pause"],
        response: "Ecoute arretee.",
    },
];

const VoiceNavButton: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isDev =
        typeof import.meta !== "undefined" &&
        (import.meta as any).env &&
        (import.meta as any).env.DEV &&
        (import.meta as any).env.VITE_APP_ENV !== "production";
    const [isListening, setIsListening] = useState(false);
    const [isHandsFree, setIsHandsFree] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [micLevel, setMicLevel] = useState<number | null>(null);
    const [isMicTestActive, setIsMicTestActive] = useState(false);
    const [voiceMode, setVoiceMode] = useState<"navigation" | "dictation">(
        "navigation"
    );
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const startListeningRef = useRef<() => void>(() => {});
    const isHandsFreeRef = useRef(false);
    const isSpeakingRef = useRef(false);
    const isListeningRef = useRef(false);
    const lastDictationRef = useRef<{ text: string; at: number } | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const micTestStreamRef = useRef<MediaStream | null>(null);
    const micTestIntervalRef = useRef<number | null>(null);
    const micTestAudioCtxRef = useRef<AudioContext | null>(null);
    const silenceTimerRef = useRef<number | null>(null);
    const silenceStopRef = useRef(false);

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

    const speak = useCallback((text: string) => {
        if (typeof window === "undefined") {
            return;
        }
        if (!("speechSynthesis" in window)) {
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "fr-CA";
        isSpeakingRef.current = true;
        const fallbackTimer = window.setTimeout(() => {
            isSpeakingRef.current = false;
            if (isHandsFreeRef.current && !isListeningRef.current) {
                startListeningRef.current();
            }
        }, 1500);
        utterance.onend = () => {
            window.clearTimeout(fallbackTimer);
            isSpeakingRef.current = false;
            if (isHandsFreeRef.current) {
                startListeningRef.current();
            }
        };
        utterance.onerror = () => {
            window.clearTimeout(fallbackTimer);
            isSpeakingRef.current = false;
            if (isHandsFreeRef.current && !isListeningRef.current) {
                startListeningRef.current();
            }
        };
        recognitionRef.current?.stop();
        window.speechSynthesis.speak(utterance);
    }, []);

    const handleTranscript = useCallback(
        (transcript: string) => {
            const normalized = normalizeText(transcript);
            const compactNormalized = normalized.replace(/\s+/g, "");
            const isWakeWord = compactNormalized.includes("clinia");

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
                navigate("/");
                setVoiceMode("dictation");
                speak("ClinIA pret, dictez votre diagnostic.");
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
                    if (normalized.includes("clinia")) {
                        speak("ClinIA pret, dictez votre diagnostic.");
                    } else {
                        speak("Retour a l'accueil.");
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
                speak("Diagnostic capture.");
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
            }, 5000);
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
            }, 5000);
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

    const startListening = useCallback(() => {
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
                    "inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs transition " +
                    (isListening
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50")
                }
                title="Dire: ouvre la page des rendez-vous, patients, cliniques, specialistes; retourne a la maison; execute; efface; arrete"
            >
                {isHandsFree
                    ? isListening
                        ? "Ecoute..."
                        : "Vocal actif"
                    : "Commande vocale"}
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
            {status && (
                <span className="text-xs text-gray-500" aria-live="polite">
                    {status}
                </span>
            )}
        </div>
    );
};

export default VoiceNavButton;
