import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

const clinicalScopes = [
  "Médecine générale",
  "Cardiologie",
  "Neurologie",
  "Psychiatrie",
  "Gériatrie",
];

const ageGroups = [
  "Adulte",
  "Pédiatrique",
  "Gériatrique",
  "Grossesse",
];

const objectives = [
  "Traitement initial",
  "Ajustement thérapeutique",
  "Alternative si intolérance",
  "Surveillance et suivi",
];

const symptomProfiles = [
  "Hypertension",
  "Douleur chronique",
  "Migraine",
  "Anxiété",
  "Insomnie",
  "Infection respiratoire",
];

const durations = [
  "< 24h",
  "1-7 jours",
  "1-4 semaines",
  "> 1 mois",
];

const severityLevels = [
  "Légère",
  "Modérée",
  "Sévère",
];

const redFlagStatuses = [
  "Aucun signal d'alarme",
  "Signal(s) d'alarme présent(s)",
];

const comorbidityContexts = [
  "Aucune comorbidité majeure",
  "Insuffisance rénale",
  "Insuffisance hépatique",
  "Risque cardiovasculaire élevé",
  "Polypharmacie",
];

const getSensitiveInputReason = (value: string): string | null => {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const patterns = [
    {
      regex:
        /\b(nom du patient|nom patient|prenom|prénom|assurance maladie|ramq|nas|adresse|telephone|téléphone|courriel|email)\b/i,
      reason: "termes d'identification personnelle",
    },
    {
      regex: /\b[A-Z]{4}\s?\d{8}\b/i,
      reason: "numéro d'assurance maladie potentiel",
    },
    {
      regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      reason: "adresse courriel",
    },
    {
      regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/,
      reason: "numéro de téléphone",
    },
    {
      regex: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/,
      reason: "date personnelle potentielle",
    },
  ];

  const match = patterns.find((entry) => entry.regex.test(text));
  return match ? match.reason : null;
};

const SearchBar: React.FC = () => {
  const [isWaitingDictation, setIsWaitingDictation] = useState(false);
  const [clinicalScope, setClinicalScope] = useState(clinicalScopes[0]);
  const [ageGroup, setAgeGroup] = useState(ageGroups[0]);
  const [objective, setObjective] = useState(objectives[0]);
  const [symptomProfile, setSymptomProfile] = useState(symptomProfiles[0]);
  const [duration, setDuration] = useState(durations[0]);
  const [severity, setSeverity] = useState(severityLevels[0]);
  const [redFlagStatus, setRedFlagStatus] = useState(redFlagStatuses[0]);
  const [comorbidityContext, setComorbidityContext] = useState(comorbidityContexts[0]);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [inputWarning, setInputWarning] = useState<string | null>(null);
  const navigate = useNavigate();
  const lastInsertRef = useRef<{ text: string; at: number } | null>(null);

  const handleSearch = useCallback(() => {
    const reason = getSensitiveInputReason(clinicalNotes);
    if (reason) {
      setInputWarning(
        `Entrée bloquée: ${reason}. Retirez toute donnée personnelle (nom, RAMQ, téléphone, courriel) avant de continuer.`
      );
      return;
    }

    setInputWarning(null);
    const notesSection = clinicalNotes.trim()
      ? ` | Notes cliniques: ${clinicalNotes.trim()}`
      : "";
    const q =
      `Symptôme: ${symptomProfile}` +
      ` | Durée: ${duration}` +
      ` | Sévérité: ${severity}` +
      ` | Drapeaux rouges: ${redFlagStatus}` +
      ` | Comorbidités: ${comorbidityContext}` +
      ` | Contexte: ${clinicalScope}` +
      ` | Groupe: ${ageGroup}` +
      ` | Objectif: ${objective}` +
      notesSection;
    navigate(`/results?q=${encodeURIComponent(q)}`);
  }, [
    ageGroup,
    clinicalNotes,
    clinicalScope,
    comorbidityContext,
    duration,
    navigate,
    objective,
    redFlagStatus,
    severity,
    symptomProfile,
  ]);

  useEffect(() => {
    // Initialize waiting state from localStorage in case voice-start occurred
    // before this component mounted (e.g., navigation to home).
    try {
      const stored = window.localStorage.getItem("clinia_waiting_dictation");
      if (stored === "1") setIsWaitingDictation(true);
    } catch (e) {}
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const shouldInsert = (text: string) => {
      const normalized = normalize(text);
      if (!normalized) {
        return false;
      }
      const now = Date.now();
      const last = lastInsertRef.current;
      if (last && last.text === normalized && now - last.at < 2000) {
        return false;
      }
      lastInsertRef.current = { text: normalized, at: now };
      return true;
    };

    const consumeBufferedDictation = () => {
      const buffered = (window as any).__cliniaLastDictation as
        | string
        | undefined;
      if (!buffered) {
        return;
      }
      (window as any).__cliniaLastDictation = "";
      setClinicalNotes((prev) => {
        const nextText = buffered.trim();
        if (!nextText || !shouldInsert(nextText)) {
          return prev;
        }
        return prev ? `${prev} ${nextText}` : nextText;
      });

      const reason = getSensitiveInputReason(buffered);
      if (reason) {
        setInputWarning(
          `Attention: dictée possiblement sensible détectée (${reason}). Vérifiez et retirez les identifiants.`
        );
      }
    };

    consumeBufferedDictation();

    const handleDictation = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) {
        return;
      }
      // Received dictation -> re-enable search button and clear persisted flag
      try {
        window.localStorage.removeItem("clinia_waiting_dictation");
      } catch (e) {}
      setIsWaitingDictation(false);
      setClinicalNotes((prev) => {
        const nextText = detail.text.trim();
        if (!nextText || !shouldInsert(nextText)) {
          return prev;
        }
        return prev ? `${prev} ${nextText}` : nextText;
      });

      const reason = getSensitiveInputReason(detail.text);
      if (reason) {
        setInputWarning(
          `Attention: dictée possiblement sensible détectée (${reason}). Vérifiez et retirez les identifiants.`
        );
      }
    };

    const handleExecute = () => {
      handleSearch();
    };

    const handleClear = () => {
      setClinicalNotes("");
      setInputWarning(null);
      // Visual waiting state: show red border when cleared by voice
      setIsWaitingDictation(true);
    };

    window.addEventListener("clinia:voice-dictation", handleDictation);
    const handleVoiceStart = () => setIsWaitingDictation(true);
    window.addEventListener("clinia:voice-start", handleVoiceStart);
    window.addEventListener("clinia:voice-execute", handleExecute);
    window.addEventListener("clinia:voice-clear", handleClear);

    return () => {
      window.removeEventListener("clinia:voice-dictation", handleDictation);
      window.removeEventListener("clinia:voice-start", handleVoiceStart);
      window.removeEventListener("clinia:voice-execute", handleExecute);
      window.removeEventListener("clinia:voice-clear", handleClear);
    };
  }, [handleSearch]);

  const containerClass =
    "bg-white shadow-sm rounded-xl px-4 py-3 flex items-center gap-3 border " +
    (isWaitingDictation ? "border-red-500" : "border-black");

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div className="text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 text-left">
        Mode sécurisé : utilisez d&apos;abord les listes guidées, puis ajoutez des notes cliniques
        anonymisées au besoin.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left">
        <label className="text-xs text-gray-600">
          Spécialité
          <select
            value={clinicalScope}
            onChange={(e) => setClinicalScope(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
          >
            {clinicalScopes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-600">
          Groupe patient
          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
          >
            {ageGroups.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-600">
          Objectif
          <select
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
          >
            {objectives.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
        <label className="text-xs text-gray-600">
          Symptôme principal
          <select
            value={symptomProfile}
            onChange={(e) => setSymptomProfile(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
          >
            {symptomProfiles.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-600">
          Durée des symptômes
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
          >
            {durations.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-600">
          Sévérité
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
          >
            {severityLevels.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-600">
          Drapeaux rouges
          <select
            value={redFlagStatus}
            onChange={(e) => setRedFlagStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
          >
            {redFlagStatuses.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-600 sm:col-span-2">
          Contexte comorbidités
          <select
            value={comorbidityContext}
            onChange={(e) => setComorbidityContext(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
          >
            {comorbidityContexts.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={containerClass}>
        <Search className="text-gray-400 w-5 h-5" />
        <textarea
          placeholder="Notes cliniques optionnelles (anonymisées uniquement)"
          value={clinicalNotes}
          onChange={(e) => {
            const next = e.target.value;
            setClinicalNotes(next);
            const reason = getSensitiveInputReason(next);
            setInputWarning(
              reason
                ? `Attention: contenu sensible possible détecté (${reason}).`
                : null
            );
          }}
          className="flex-1 outline-none text-sm sm:text-base text-gray-800 placeholder:text-gray-400 bg-transparent resize-none min-h-[56px]"
        />
        <button
          onClick={handleSearch}
          disabled={isWaitingDictation || Boolean(inputWarning)}
          className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          Lancer Requête sécurisée
        </button>
      </div>
      {inputWarning && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {inputWarning}
        </div>
      )}
      <div className="text-xs text-gray-500">
        N&apos;entrez jamais de nom de patient, numéro d&apos;assurance maladie, téléphone,
        courriel ou adresse.
      </div>
    </div>
  );
};

export default SearchBar;
