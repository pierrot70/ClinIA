import React, { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type Command = {
    label: string;
    path: string;
    keywords: string[];
};

const normalizeText = (value: string) =>
    value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const COMMANDS: Command[] = [
    {
        label: "Rendez-vous",
        path: "/appointments",
        keywords: ["rendez vous", "rendez-vous", "rdv"],
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

const VoiceNavButton: React.FC = () => {
    const navigate = useNavigate();
    const [isListening, setIsListening] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    const isSupported = useMemo(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return (
            "SpeechRecognition" in window || "webkitSpeechRecognition" in window
        );
    }, []);

    const handleTranscript = useCallback(
        (transcript: string) => {
            const normalized = normalizeText(transcript);
            const matched = COMMANDS.find((command) =>
                command.keywords.some((keyword) =>
                    normalized.includes(normalizeText(keyword))
                )
            );

            if (matched) {
                setStatus(`Navigation: ${matched.label}`);
                navigate(matched.path);
                return;
            }

            setStatus(`Commande non reconnue: "${transcript}"`);
        },
        [navigate]
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
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            handleTranscript(transcript);
        };
        recognition.onerror = (event) => {
            setStatus(`Erreur vocale: ${event.error}`);
            setIsListening(false);
        };
        recognition.onend = () => {
            setIsListening(false);
        };
        return recognition;
    }, [handleTranscript]);

    const toggleListening = () => {
        if (!isSupported) {
            setStatus("Navigation vocale non supportee sur ce navigateur.");
            return;
        }

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
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
        recognition.start();
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
                title="Dire: ouvre la page des rendez-vous, patients, cliniques, specialistes"
            >
                {isListening ? "Ecoute..." : "Commande vocale"}
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
