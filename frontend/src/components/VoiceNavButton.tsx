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
    const [isListening, setIsListening] = useState(false);
    const [isHandsFree, setIsHandsFree] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [voiceMode, setVoiceMode] = useState<"navigation" | "dictation">(
        "navigation"
    );
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const startListeningRef = useRef<() => void>(() => {});
    const isHandsFreeRef = useRef(false);
    const isSpeakingRef = useRef(false);
    const isListeningRef = useRef(false);
    const lastDictationRef = useRef<{ text: string; at: number } | null>(null);

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
        utterance.onend = () => {
            isSpeakingRef.current = false;
            if (isHandsFreeRef.current) {
                startListeningRef.current();
            }
        };
        utterance.onerror = () => {
            isSpeakingRef.current = false;
        };
        recognitionRef.current?.stop();
        window.speechSynthesis.speak(utterance);
    }, []);

    const handleTranscript = useCallback(
        (transcript: string) => {
            const normalized = normalizeText(transcript);
            const compactNormalized = normalized.replace(/\s+/g, "");
            const isWakeWord = compactNormalized.includes("clinia");

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
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            handleTranscript(transcript);
        };
        recognition.onerror = (event) => {
            setStatus(`Erreur vocale: ${event.error}`);
            setIsListening(false);
            isListeningRef.current = false;
        };
        recognition.onend = () => {
            setIsListening(false);
            isListeningRef.current = false;
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
        recognition.start();
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
            {status && (
                <span className="text-xs text-gray-500" aria-live="polite">
                    {status}
                </span>
            )}
        </div>
    );
};

export default VoiceNavButton;
