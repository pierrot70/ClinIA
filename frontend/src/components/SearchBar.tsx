import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { useClinicalAnalysisNavigation } from "../contexts/ClinicalAnalysisNavigationContext";
import {
  createPatient,
  fetchPatientSecureRequestDocuments,
  fetchPatientsPaginated,
  updatePatient,
  type PatientSecureRequestDocument,
  type Patient,
} from "../services/patientsApi";
import type { ClinicalPayload, Sex } from "../types/clinical";

const CREATE_PATIENT_OPTION = "__create_patient__";
const UNDEFINED_FIELD_DISPLAY = "undefined";

function splitPatientName(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return { prenom: "", nom: "" };
  }

  if (parts.length === 1) {
    return {
      prenom: "Patient",
      nom: parts[0],
    };
  }

  return {
    prenom: parts[0],
    nom: parts.slice(1).join(" "),
  };
}

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

const normalizeOptionalAdvancedField = (value: string): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.toLowerCase() === UNDEFINED_FIELD_DISPLAY ? "" : trimmed;
};

const formatOptionalAdvancedFieldForEdit = (value?: string): string => {
  const trimmed = String(value || "").trim();
  return trimmed || UNDEFINED_FIELD_DISPLAY;
};

const normalizeSexForAnalysis = (value: string): Sex => {
  const normalized = normalizeOptionalAdvancedField(value).toLowerCase();

  if (["male", "m", "man", "homme", "masculin"].includes(normalized)) {
    return "male";
  }

  if (["female", "f", "woman", "femme", "feminin", "féminin"].includes(normalized)) {
    return "female";
  }

  return "other";
};

const normalizeAgeForAnalysis = (value: string): number => {
  const parsed = Number.parseInt(normalizeOptionalAdvancedField(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 55;
};

const splitListField = (value: string): string[] =>
  normalizeOptionalAdvancedField(value)
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const getPatientDocumentId = (document: PatientSecureRequestDocument): string =>
  String(document.id).trim();

const formatDocumentTimestamp = (value?: string): string => {
  if (!value) {
    return "date inconnue";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const formatSecureRequestDocumentLabel = (
  document: PatientSecureRequestDocument
): string => {
  return `${document.clinicalScope} - derniere requete du ${formatDocumentTimestamp(
    document.uploadedAt
  )}`;
};

const SearchBar: React.FC = () => {
  const { strings } = useHomeI18n();
  const {
    objectives,
    clinicalScopes,
    ageGroups,
    symptomProfiles,
    durations,
    severityLevels,
    redFlagStatuses,
    comorbidityContexts,
  } = strings.options;

  const [isWaitingDictation, setIsWaitingDictation] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clinicalScope, setClinicalScope] = useState(clinicalScopes[0]);
  const [ageGroup, setAgeGroup] = useState(ageGroups[0]);
  const [objective, setObjective] = useState(objectives[0]);
  const [sex, setSex] = useState("");
  const [age, setAge] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [symptomProfile, setSymptomProfile] = useState(symptomProfiles[0]);
  const [cancerType, setCancerType] = useState("");
  const [duration, setDuration] = useState(durations[0]);
  const [severity, setSeverity] = useState(severityLevels[0]);
  const [redFlagStatus, setRedFlagStatus] = useState(redFlagStatuses[0]);
  const [comorbidityContext, setComorbidityContext] = useState(comorbidityContexts[0]);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [availablePatientDocuments, setAvailablePatientDocuments] = useState<PatientSecureRequestDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isDocumentsModalOpen, setIsDocumentsModalOpen] = useState(false);
  const [patientNameDraft, setPatientNameDraft] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [createPatientError, setCreatePatientError] = useState<string | null>(null);
  const [inputWarning, setInputWarning] = useState<string | null>(null);
  const [privacyAttestation, setPrivacyAttestation] = useState(false);
  const [sensitiveReason, setSensitiveReason] = useState<string | null>(null);
  const [sensitiveAcknowledged, setSensitiveAcknowledged] =
    useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setPendingClinicalAnalysis } = useClinicalAnalysisNavigation();
  const lastInsertRef = useRef<{ text: string; at: number } | null>(null);

  const selectedPatient =
    patients.find((patient) => patient._id === selectedPatientId) || null;
  const isCreatingPatient = selectedPatientId === CREATE_PATIENT_OPTION;

  const clearVoiceWaitingState = useCallback(() => {
    setIsWaitingDictation(false);
    try {
      window.localStorage.removeItem("clinia_waiting_dictation");
    } catch (e) {}
  }, []);

  const handleCreatePatient = useCallback(async () => {
    const trimmedName = patientNameDraft.trim();
    const creatorReference = user?.id || user?.email || "";

    if (!trimmedName) {
      setCreatePatientError(
        "Le nom du patient est requis."
      );
      return;
    }

    if (!creatorReference) {
      setCreatePatientError(
        "Aucun usager authentifie n'est disponible pour creer ce patient."
      );
      return;
    }

    const { prenom, nom } = splitPatientName(trimmedName);
    if (!prenom || !nom) {
      setCreatePatientError("Impossible d'interpreter le nom du patient.");
      return;
    }

    setCreatingPatient(true);
    setCreatePatientError(null);

    const response = await createPatient({
      prenom,
      nom,
      created_by_reference: creatorReference,
    });

    setCreatingPatient(false);

    if ("error" in response) {
      setCreatePatientError(
        response.error.message || "Impossible de creer le patient."
      );
      return;
    }

    setPatients((prev) => [...prev, response.data].sort((a, b) => {
      const lastNameCompare = a.nom.localeCompare(b.nom, "fr", {
        sensitivity: "base",
      });
      if (lastNameCompare !== 0) {
        return lastNameCompare;
      }
      return a.prenom.localeCompare(b.prenom, "fr", {
        sensitivity: "base",
      });
    }));
    setSelectedPatientId(response.data._id);
    setSelectedDocumentIds([]);
    setPatientNameDraft("");
  }, [patientNameDraft, user?.email, user?.id]);

  const handleSearch = useCallback(async () => {
    if (!privacyAttestation) {
      setInputWarning(strings.search.privacyConfirmRequired);
      return;
    }

    const reason = getSensitiveInputReason(clinicalNotes);
    if (reason && !sensitiveAcknowledged) {
      setSensitiveReason(reason);
      setInputWarning(`${strings.search.blockedSensitive} (${reason}).`);
      return;
    }

    setInputWarning(null);
    const normalizedSex = normalizeOptionalAdvancedField(sex);
    const normalizedAge = normalizeOptionalAdvancedField(age);
    const normalizedCurrentMedications = normalizeOptionalAdvancedField(currentMedications);
    let mainSymptom = symptomProfile;
    if (symptomProfile === "Cancer" && cancerType.trim()) {
      mainSymptom = cancerType.trim();
    }
    const notesSection = clinicalNotes.trim()
      ? ` | ${strings.search.notesLabel}: ${clinicalNotes.trim()}`
      : "";
    const sexSection = normalizedSex
      ? ` | ${strings.search.sexLabel}: ${normalizedSex}`
      : "";
    const ageSection = normalizedAge
      ? ` | ${strings.search.ageLabel}: ${normalizedAge}`
      : "";
    const currentMedicationsSection = normalizedCurrentMedications
      ? ` | ${strings.search.currentMedicationsLabel}: ${normalizedCurrentMedications}`
      : "";
    const q =
      `${strings.search.symptomLabel}: ${mainSymptom}` +
      ` | ${strings.search.durationLabel}: ${duration}` +
      ` | ${strings.search.severityLabel}: ${severity}` +
      ` | ${strings.search.redFlagsLabel}: ${redFlagStatus}` +
      ` | ${strings.search.comorbidityLabel}: ${comorbidityContext}` +
      ` | ${strings.search.scopeLabel}: ${clinicalScope}` +
      ` | ${strings.search.ageGroupLabel}: ${ageGroup}` +
      ` | ${strings.search.objectiveLabel}: ${objective}` +
      sexSection +
      ageSection +
      currentMedicationsSection +
      notesSection;
    const analysisPayload: ClinicalPayload = {
      age: normalizeAgeForAnalysis(age),
      sex: normalizeSexForAnalysis(sex),
      symptoms: [q],
      medical_history: [],
      current_medications: splitListField(currentMedications),
    };

    if (selectedPatientId && selectedPatientId !== CREATE_PATIENT_OPTION && selectedPatient) {
      const saveResponse = await updatePatient(selectedPatientId, {
        nom: selectedPatient?.nom || "",
        prenom: selectedPatient?.prenom || "",
        secure_request_profile: {
          objective,
          sex: normalizedSex,
          age: normalizedAge,
          current_medications: normalizedCurrentMedications,
          selected_document_ids: selectedDocumentIds,
          clinicalScope,
          ageGroup,
          symptomProfile,
          cancerType,
          duration,
          severity,
          redFlagStatus,
          comorbidityContext,
          clinicalNotes,
          privacyAttestation,
          lastRequestedAt: new Date().toISOString(),
        },
      });

      if ("error" in saveResponse) {
        setInputWarning(
          saveResponse.error.message ||
            "Impossible de sauvegarder les parametres du patient."
        );
        return;
      }

      setPatients((prev) =>
        prev.map((patient) =>
          patient._id === selectedPatientId ? saveResponse.data : patient
        )
      );
    }

    setPendingClinicalAnalysis({
      payload: analysisPayload,
      patientDisplayName: selectedPatient
        ? `${selectedPatient.prenom} ${selectedPatient.nom}`.trim()
        : undefined,
    });
    navigate("/results");
  }, [
    ageGroup,
    cancerType,
    clinicalNotes,
    clinicalScope,
    comorbidityContext,
    currentMedications,
    duration,
    navigate,
    objective,
    age,
    privacyAttestation,
    redFlagStatus,
    setPendingClinicalAnalysis,
    selectedPatient?.nom,
    selectedPatient?.prenom,
    selectedPatientId,
    selectedDocumentIds,
    severity,
    sex,
    symptomProfile,
    strings.search.ageLabel,
    strings.search.blockedSensitive,
    strings.search.comorbidityLabel,
    strings.search.currentMedicationsLabel,
    strings.search.durationLabel,
    strings.search.ageGroupLabel,
    strings.search.notesLabel,
    strings.search.objectiveLabel,
    strings.search.privacyConfirmRequired,
    strings.search.redFlagsLabel,
    strings.search.scopeLabel,
    strings.search.severityLabel,
    strings.search.sexLabel,
    strings.search.symptomLabel,
    selectedPatient,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadPatients() {
      setPatientsLoading(true);
      setPatientsError(null);

      const response = await fetchPatientsPaginated({
        page: 1,
        limit: 50,
        sortBy: "nom",
        sortDir: "asc",
      });

      if (cancelled) {
        return;
      }

      if ("error" in response) {
        setPatientsError(response.error.message);
        setPatients([]);
        setPatientsLoading(false);
        return;
      }

      setPatients(response.data.data);
      if (response.data.data.length === 0) {
        setSelectedPatientId(CREATE_PATIENT_OPTION);
      }
      setPatientsLoading(false);
    }

    loadPatients();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSecureRequestDocuments() {
      if (!selectedPatientId || selectedPatientId === CREATE_PATIENT_OPTION) {
        setAvailablePatientDocuments([]);
        setSelectedDocumentIds([]);
        setDocumentsLoading(false);
        return;
      }

      setDocumentsLoading(true);

      const response = await fetchPatientSecureRequestDocuments(selectedPatientId);

      if (cancelled) {
        return;
      }

      if ("error" in response) {
        setAvailablePatientDocuments([]);
        setSelectedDocumentIds([]);
        setDocumentsLoading(false);
        return;
      }

      setAvailablePatientDocuments(response.data);
      setSelectedDocumentIds((current) => {
        const allowedIds = new Set(response.data.map((document) => document.id));
        return current.filter((entry) => allowedIds.has(entry));
      });
      setDocumentsLoading(false);
    }

    void loadSecureRequestDocuments();

    return () => {
      cancelled = true;
    };
  }, [selectedPatientId]);

  useEffect(() => {
    const profile = selectedPatient?.secure_request_profile;
    if (!profile) {
      return;
    }

    if (profile.objective && objectives.includes(profile.objective)) {
      setObjective(profile.objective);
    }
    setSex(formatOptionalAdvancedFieldForEdit(profile.sex));
    setAge(formatOptionalAdvancedFieldForEdit(profile.age));
    setCurrentMedications(
      formatOptionalAdvancedFieldForEdit(profile.current_medications)
    );
    setSelectedDocumentIds(
      Array.isArray(profile.selected_document_ids)
        ? profile.selected_document_ids
        : []
    );
    if (
      profile.clinicalScope &&
      clinicalScopes.includes(profile.clinicalScope)
    ) {
      setClinicalScope(profile.clinicalScope);
    }
    if (profile.ageGroup && ageGroups.includes(profile.ageGroup)) {
      setAgeGroup(profile.ageGroup);
    }
    if (
      profile.symptomProfile &&
      symptomProfiles.includes(profile.symptomProfile)
    ) {
      setSymptomProfile(profile.symptomProfile);
    }
    setCancerType(profile.cancerType || "");
    if (profile.duration && durations.includes(profile.duration)) {
      setDuration(profile.duration);
    }
    if (profile.severity && severityLevels.includes(profile.severity)) {
      setSeverity(profile.severity);
    }
    if (
      profile.redFlagStatus &&
      redFlagStatuses.includes(profile.redFlagStatus)
    ) {
      setRedFlagStatus(profile.redFlagStatus);
    }
    if (
      profile.comorbidityContext &&
      comorbidityContexts.includes(profile.comorbidityContext)
    ) {
      setComorbidityContext(profile.comorbidityContext);
    }
    setClinicalNotes(profile.clinicalNotes || "");
    setPrivacyAttestation(Boolean(profile.privacyAttestation));
    setInputWarning(null);
    setSensitiveReason(getSensitiveInputReason(profile.clinicalNotes || ""));
    setSensitiveAcknowledged(false);
  }, [
    ageGroups,
    clinicalScopes,
    comorbidityContexts,
    durations,
    objectives,
    redFlagStatuses,
    selectedPatient,
    severityLevels,
    symptomProfiles,
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
          `${strings.search.voiceSensitiveDetected} (${reason}).`
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
          `${strings.search.voiceSensitiveDetected} (${reason}).`
        );
      }
    };

    const handleExecute = () => {
      handleSearch();
    };

    const handleClear = () => {
      setClinicalNotes("");
      setInputWarning(null);
      setPrivacyAttestation(false);
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
  }, [handleSearch, strings.search.voiceSensitiveDetected]);

  useEffect(() => {
    setClinicalScope((prev) =>
      clinicalScopes.includes(prev) ? prev : clinicalScopes[0]
    );
    setAgeGroup((prev) => (ageGroups.includes(prev) ? prev : ageGroups[0]));
    setObjective((prev) => (objectives.includes(prev) ? prev : objectives[0]));
    setSymptomProfile((prev) =>
      symptomProfiles.includes(prev) ? prev : symptomProfiles[0]
    );
    setDuration((prev) => (durations.includes(prev) ? prev : durations[0]));
    setSeverity((prev) =>
      severityLevels.includes(prev) ? prev : severityLevels[0]
    );
    setRedFlagStatus((prev) =>
      redFlagStatuses.includes(prev) ? prev : redFlagStatuses[0]
    );
    setComorbidityContext((prev) =>
      comorbidityContexts.includes(prev) ? prev : comorbidityContexts[0]
    );
  }, [
    ageGroups,
    clinicalScopes,
    comorbidityContexts,
    durations,
    objectives,
    redFlagStatuses,
    severityLevels,
    symptomProfiles,
  ]);

  const containerClass =
    "bg-white shadow-sm rounded-xl px-4 py-3 flex items-center gap-3 border " +
    (isWaitingDictation ? "border-red-500" : "border-black");
  const attestationMissing = !privacyAttestation;
  const isAwaitingVoiceOnly = isWaitingDictation && !clinicalNotes.trim();
  const isSubmitDisabled =
    isAwaitingVoiceOnly ||
    attestationMissing ||
    Boolean(sensitiveReason && !sensitiveAcknowledged);

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm">
        <label className="text-xs text-gray-600 block">
          Patient
          <select
            value={selectedPatientId}
            onChange={(e) => {
              const nextPatientId = e.target.value;
              const nextPatient =
                patients.find((patient) => patient._id === nextPatientId) || null;

              setSelectedPatientId(nextPatientId);
              setSelectedDocumentIds([]);
              setIsDocumentsModalOpen(Boolean(nextPatient));
              setCreatePatientError(null);
            }}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
          >
            <option value="">
              {patientsLoading
                ? "Chargement des patients..."
                : "Selectionner un patient"}
            </option>
            <option value={CREATE_PATIENT_OPTION}>
              Creer un patient...
            </option>
            {patients.map((patient) => (
              <option key={patient._id} value={patient._id}>
                {patient.prenom} {patient.nom} - {patient.num_assurance_maladie}
              </option>
            ))}
          </select>
        </label>

        {isCreatingPatient && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3">
            <label className="block text-xs text-gray-700">
              Nom du patient
              <input
                value={patientNameDraft}
                onChange={(e) => setPatientNameDraft(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary"
                placeholder="Ex: Jean Tremblay"
              />
            </label>

            <p className="text-xs text-emerald-800">
              Cree par: {user?.email || user?.id || "Usager inconnu"}
            </p>

            <button
              type="button"
              onClick={handleCreatePatient}
              disabled={creatingPatient}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {creatingPatient ? "Creation..." : "Creer le patient"}
            </button>

            {createPatientError && (
              <p className="text-xs text-red-700">{createPatientError}</p>
            )}
          </div>
        )}

        {patientsError && (
          <p className="mt-2 text-xs text-amber-700">{patientsError}</p>
        )}

        {selectedPatient && (
          <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <div className="font-semibold">
              {selectedPatient.prenom} {selectedPatient.nom}
            </div>
            <div>RAMQ: {selectedPatient.num_assurance_maladie}</div>
            {selectedPatient.telephone && (
              <div>Telephone: {selectedPatient.telephone}</div>
            )}
            {selectedPatient.addresse && (
              <div>Addresse: {selectedPatient.addresse}</div>
            )}
            {selectedPatient.created_by_reference && (
              <div>Cree par: {selectedPatient.created_by_reference}</div>
            )}
            <div>
              Documents selectionnes: {selectedDocumentIds.length}
              {availablePatientDocuments.length > 0
                ? ` / ${availablePatientDocuments.length}`
                : ""}
            </div>
            {selectedPatient.secure_request_profile?.lastRequestedAt && (
              <div>
                Derniere requete: {new Date(
                  selectedPatient.secure_request_profile.lastRequestedAt
                ).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 text-left">
        {strings.search.secureModeHint}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
        <div />
        <div className="flex items-end justify-start sm:justify-end">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-primary transition-colors"
          >
            {showAdvanced
              ? strings.search.hideAdvanced
              : strings.search.showAdvanced}
          </button>
        </div>
      </div>

      {showAdvanced && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-xs text-gray-600">
            {strings.search.objectiveLabel}
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

          <label className="text-xs text-gray-600">
            {strings.search.sexLabel}
            <input
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
              placeholder="Ex: Female"
            />
          </label>

          <label className="text-xs text-gray-600">
            {strings.search.ageLabel}
            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
              placeholder="Ex: 54"
            />
          </label>

          </div>

          <label className="block text-xs text-gray-600">
            {strings.search.currentMedicationsLabel}
            <textarea
              value={currentMedications}
              onChange={(e) => setCurrentMedications(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary resize-none min-h-[72px]"
              placeholder={strings.search.currentMedicationsPlaceholder}
            />
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">

          <label className="text-xs text-gray-600">
            {strings.search.scopeLabel}
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

          {selectedPatient && (
            <div className="text-xs text-gray-600 sm:col-span-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div>
                  <div className="font-medium text-gray-700">Documents du patient</div>
                  <div className="text-gray-500">
                    {documentsLoading
                      ? "Chargement des dernieres requetes..."
                      : `${selectedDocumentIds.length} document(s) selectionne(s)`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDocumentsModalOpen(true)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400"
                >
                  Choisir les documents
                </button>
              </div>
            </div>
          )}

          <label className="text-xs text-gray-600">
            {strings.search.ageGroupLabel}
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
            {strings.search.symptomLabel}
            <select
              value={symptomProfile}
              onChange={(e) => {
                setSymptomProfile(e.target.value);
                if (e.target.value !== "Cancer") setCancerType("");
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary"
            >
              {symptomProfiles.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {symptomProfile === "Cancer" && (
              <select
                className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary animate-fadein"
                value={cancerType}
                onChange={e => setCancerType(e.target.value)}
              >
                <option value="">Select cancer type…</option>
                <option value="Stomach cancer">Stomach cancer</option>
                <option value="Breast cancer">Breast cancer</option>
                <option value="Lung cancer">Lung cancer</option>
                <option value="Colorectal cancer">Colorectal cancer</option>
              </select>
            )}
          </label>

          <label className="text-xs text-gray-600">
            {strings.search.durationLabel}
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
            {strings.search.severityLabel}
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
            {strings.search.redFlagsLabel}
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

          <label className="text-xs text-gray-600 sm:col-span-3">
            {strings.search.comorbidityLabel}
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
        </div>
      )}

      <div className={containerClass}>
        <Search className="text-gray-400 w-5 h-5" />
        <textarea
          placeholder={strings.search.notesPlaceholder}
          value={clinicalNotes}
          onChange={(e) => {
            clearVoiceWaitingState();
            const next = e.target.value;
            setClinicalNotes(next);
            const reason = getSensitiveInputReason(next);
            setSensitiveReason(reason);
            setSensitiveAcknowledged(false);
            setInputWarning(
              reason
                ? `${strings.search.sensitiveDetected} (${reason}).`
                : null
            );
          }}
          className="flex-1 outline-none text-sm sm:text-base text-gray-800 placeholder:text-gray-400 bg-transparent resize-none min-h-[56px]"
        />
        <button
          onClick={handleSearch}
          disabled={isSubmitDisabled}
          className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          title={attestationMissing ? "Cochez d'abord l'attestation" : undefined}
        >
          {attestationMissing
            ? strings.search.checkAttestation
            : strings.search.launchSecure}
        </button>
      </div>

      {attestationMissing && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 animate-pulse">
          {strings.search.attestationRequiredHint}
        </div>
      )}

      <label
        className={
          "flex items-start gap-2 text-xs rounded-lg px-3 py-2 transition-colors " +
          (attestationMissing
            ? "text-amber-900 bg-amber-50 border border-amber-300 ring-1 ring-amber-300 animate-pulse"
            : "text-gray-700 bg-gray-50 border border-gray-200")
        }
      >
        <input
          type="checkbox"
          checked={privacyAttestation}
          onChange={(e) => {
            clearVoiceWaitingState();
            const checked = e.target.checked;
            setPrivacyAttestation(checked);
            if (checked && inputWarning === "Veuillez confirmer l'attestation de confidentialité avant l'envoi.") {
              setInputWarning(null);
            }
          }}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span>
          {strings.search.attestationText}
        </span>
      </label>

      {inputWarning && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {inputWarning}
        </div>
      )}

      {sensitiveReason && !sensitiveAcknowledged && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-xs text-red-800 space-y-2">
          <div>
            Contenu potentiellement non securitaire detecte ({sensitiveReason}).
            Confirmez explicitement avant de continuer.
          </div>
          <button
            type="button"
            onClick={() => {
              setSensitiveAcknowledged(true);
              setInputWarning(null);
            }}
            className="rounded bg-red-600 px-3 py-1.5 text-white hover:bg-red-700 transition-colors"
          >
            J'ai lu et compris
          </button>
        </div>
      )}
      {isDocumentsModalOpen && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Documents du patient
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Selectionnez un ou plusieurs documents pour la requete securisee de {selectedPatient.prenom} {selectedPatient.nom}.
              </p>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
              {documentsLoading ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Chargement des dernieres requetes securisees...
                </div>
              ) : availablePatientDocuments.length > 0 ? (
                <div className="space-y-3">
                  {availablePatientDocuments.map((document) => {
                    const documentId = getPatientDocumentId(document);
                    const isChecked = selectedDocumentIds.includes(documentId);

                    return (
                      <label
                        key={documentId}
                        className="flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => {
                            setSelectedDocumentIds((current) => {
                              if (event.target.checked) {
                                return Array.from(new Set([...current, documentId]));
                              }

                              return current.filter((entry) => entry !== documentId);
                            });
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="flex-1">
                          <span className="block font-medium text-gray-900">
                            {formatSecureRequestDocumentLabel(document)}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {document.type || "Type inconnu"}
                            {document.objective ? ` | ${document.objective}` : ""}
                            {document.uploadedAt
                              ? ` | ${formatDocumentTimestamp(document.uploadedAt)}`
                              : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Aucune requete securisee precedente disponible pour ce patient.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  const allDocumentIds = availablePatientDocuments.map(getPatientDocumentId);
                  setSelectedDocumentIds(allDocumentIds);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-gray-400"
              >
                Tout selectionner
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsDocumentsModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-gray-400"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={() => setIsDocumentsModalOpen(false)}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="text-xs text-gray-500">
        {strings.search.privacyFooter}
      </div>
    </div>
  );
};

export default SearchBar;
