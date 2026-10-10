import { labels } from "../i18n/uiLabels";
import { useUiLabels } from "../hooks/useUiLabels";
import React from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Treatment } from "../data/types";
import type { EvidenceLevel } from "../types/clinical";
import { useTranslation } from "../hooks/useTranslation";
import {
  getImmediateEnglishClinicalContent,
  shouldHideFrenchSourceInEnglish,
} from "../i18n/clinicalContentEnglish";

interface Props {
  treatment: ClinicalTreatmentCardData;
  sourceMode?: string;
  realAI?: boolean;
  language?: "fr" | "en";
}

type ClinicalTreatmentCardData = Treatment & {
  evidence_level?: EvidenceLevel;
  monitoring?: string[];
  contraindications?: string[] | string;
};

function getClinicalRelevanceLabel(treatment: ClinicalTreatmentCardData, language: "fr" | "en") {
  const english = language === "en";
  const flags = Array.isArray(treatment.flags) ? treatment.flags : [];
  const evidenceLevel = treatment.evidence_level ?? "C";
  const monitoringCount = Array.isArray(treatment.monitoring)
    ? treatment.monitoring.length
    : 0;
  const contraindicationCount = Array.isArray(treatment.contraindications)
    ? treatment.contraindications.length
    : typeof treatment.contraindications === "string" &&
        treatment.contraindications.trim()
      ? 1
      : 0;

  if (evidenceLevel === "A" && monitoringCount <= 1 && contraindicationCount <= 1) {
    return labels.pageUi.pertinenceCliniqueElevee;
  }

  if (evidenceLevel === "A" || evidenceLevel === "B") {
    if (monitoringCount >= 2 || contraindicationCount >= 2) {
      return labels.pageUi.optionPertinenteAvecVigilance;
    }
    return labels.pageUi.optionCliniquementSolide;
  }

  if (flags.includes("wellTolerated") && flags.includes("monitoring")) {
    return labels.pageUi.aEvaluerSelonLeContexte;
  }

  if (flags.includes("wellTolerated")) {
    return labels.pageUi.optionCourante;
  }

  if (flags.includes("monitoring")) {
    return labels.pageUi.optionASurveiller;
  }

  return labels.pageUi.aDiscuter;
}

function getSourceFootnote(sourceMode: string | undefined, realAI: boolean | undefined, language: "fr" | "en") {
  const english = language === "en";
  if (sourceMode === "real") {
    return realAI
      ? (labels.componentUi.baseSurUneReponseOpenAIReelle)
      : (labels.componentUi.baseSurUneReponseOpenAIReelleMiseEnCache);
  }

  if (sourceMode === "degraded") {
    return labels.componentUi.baseSurUneReponseDegradeeDeSecours;
  }

  if (sourceMode === "mock") {
    return labels.componentUi.baseSurDesDonneesSimulees;
  }

  return labels.componentUi.baseSurUnContexteCliniqueGenere;
}

const TreatmentCard: React.FC<Props> = ({ treatment, sourceMode, realAI, language = "fr" }) => {
    const { locale: uiLocale, t } = useUiLabels(language);
  const english = language === "en";
  const flags = Array.isArray(treatment.flags) ? treatment.flags : [];
  const relevanceLabel = getClinicalRelevanceLabel(treatment, "fr");
  const sourceFootnote = getSourceFootnote(sourceMode, realAI, "fr");
  const nameTranslation = useTranslation({ text: treatment.name, targetLang: language });
  const classTranslation = useTranslation({ text: treatment.class, targetLang: language });
  const summaryTranslation = useTranslation({ text: treatment.summary, targetLang: language });
  const displayEnglishContent = (
    source: string,
    translated: string,
    loading: boolean,
    fallback: string
  ) => {
    if (!english) return translated;
    const immediate = getImmediateEnglishClinicalContent(source);
    if (immediate) return immediate;
    if (loading || translated === source || shouldHideFrenchSourceInEnglish(translated)) return fallback;
    return translated;
  };
  const displayedName = displayEnglishContent(
    treatment.name,
    nameTranslation.translated,
    nameTranslation.loading,
    "Clinical option"
  );
  const displayedClass = displayEnglishContent(
    treatment.class,
    classTranslation.translated,
    classTranslation.loading,
    "Clinical treatment"
  );
  const displayedSummary = displayEnglishContent(
    treatment.summary,
    summaryTranslation.translated,
    summaryTranslation.loading,
    "Clinical summary available in the source analysis."
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base text-gray-900">
            {displayedName}
          </h3>
          <p className="text-xs text-gray-500">{displayedClass}</p>
        </div>
        <div className="text-right max-w-[11rem]">
          <div className="text-xs uppercase text-gray-400">{t(labels.pageUi.pertinenceClinique)}</div>
          <div className="text-sm font-semibold text-primary">
            {t(relevanceLabel)}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-700">{displayedSummary}</p>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
          {t(labels.componentUi.firstLine)}
        </span>
        {flags.includes("wellTolerated") && (
          <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            {t(labels.componentUi.bienTolere)}
          </span>
        )}
        {flags.includes("monitoring") && (
          <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            {t(labels.componentUi.surveillanceRequise)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
        <span>{t(sourceFootnote)}</span>
        <Link
          to={`/treatment/${encodeURIComponent(treatment.id)}`}
          state={{
            treatment,
            sourceMode,
            realAI,
          }}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {t(labels.componentUi.details)}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};

export default TreatmentCard;
