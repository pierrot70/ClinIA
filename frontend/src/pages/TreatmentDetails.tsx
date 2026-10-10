import { labels } from "../i18n/uiLabels";
import { useUiLabels } from "../hooks/useUiLabels";
import { translateUiLabelTree } from "../i18n/pageUiLabels";
import React from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { hypertensionTreatments } from "../data/hypertension";
import type { Treatment } from "../data/types";
import type { EvidenceLevel } from "../types/clinical";

type DetailTreatment = {
  id: string;
  name: string;
  shortName?: string;
  class?: string;
  details?: string;
  summary?: string;
  indication?: string;
  dosage?: string;
  duration?: string;
  flags?: string[];
  contraindications?: string[] | string;
  monitoring?: string[];
  evidence_level?: EvidenceLevel;
};

type TreatmentLocationState = {
  treatment?: DetailTreatment;
  sourceMode?: string;
  realAI?: boolean;
};

function getClinicalRelevanceLabel(treatment?: DetailTreatment) {
  const flags = Array.isArray(treatment?.flags) ? treatment.flags : [];
  const evidenceLevel = treatment?.evidence_level ?? "C";
  const monitoringCount = Array.isArray(treatment?.monitoring)
    ? treatment.monitoring.length
    : 0;
  const contraindicationCount = Array.isArray(treatment?.contraindications)
    ? treatment.contraindications.length
    : typeof treatment?.contraindications === "string" &&
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

function getSourceLabel(sourceMode?: string, realAI?: boolean) {
  if (sourceMode === "real") {
    return realAI
      ? labels.pageUi.reponseOpenAIReelle
      : labels.pageUi.reponseOpenAIReelleMiseEnCache;
  }

  if (sourceMode === "degraded") {
    return labels.pageUi.reponseDegradeeDeSecours;
  }

  if (sourceMode === "mock") {
    return labels.pageUi.donneesSimulees;
  }

  return labels.pageUi.contexteCliniqueGenere;
}

function normalizeList(value?: string[] | string) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function normalizeFallbackTreatment(treatment?: Treatment): DetailTreatment | null {
  if (!treatment) {
    return null;
  }

  return {
    id: treatment.id,
    name: treatment.name,
    shortName: treatment.shortName,
    class: treatment.class,
    details: treatment.details,
    summary: treatment.summary,
    flags: treatment.flags,
  };
}

const TreatmentDetails: React.FC = () => {
    const { locale: uiLocale, t } = useUiLabels();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const locationState = (location.state as TreatmentLocationState | null) ?? null;

  const fallbackTreatment = normalizeFallbackTreatment(
    hypertensionTreatments.find(
      (t) => t.id === decodeURIComponent(id || "")
    )
  );
  const treatment = locationState?.treatment ?? fallbackTreatment;

  if (!treatment) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-sm text-gray-600 mb-4">
          {t(labels.pageUi.traitementIntrouvable)}</p>
        <Link to="/results" className="text-primary text-sm hover:underline">
          {t(labels.pageUi.retourAuxResultats)}</Link>
      </div>
    );
  }

  const flags = Array.isArray(treatment.flags) ? treatment.flags : [];
  const monitoringItems = normalizeList(treatment.monitoring);
  const contraindicationItems = normalizeList(treatment.contraindications);
  const relevanceLabel = getClinicalRelevanceLabel(treatment);
  const sourceLabel = getSourceLabel(
    locationState?.sourceMode,
    locationState?.realAI
  );
  const surveillanceLabel =
    monitoringItems.length >= 2
      ? labels.pageUi.surveillanceRenforcee
      : monitoringItems.length === 1 || flags.includes("monitoring")
      ? labels.pageUi.surveillanceCiblee
      : labels.pageUi.surveillanceStandard;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          {t(sourceLabel)}
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">
          {treatment.name}
        </h1>
        <p className="text-sm text-gray-600">{treatment.class ?? t(labels.pageUi.treatment)}</p>
      </div>

      <section className="grid sm:grid-cols-3 gap-4 text-sm">
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
          <div className="text-xs text-gray-500">{t(labels.pageUi.pertinenceClinique)}</div>
          <div className="text-lg font-semibold text-primary">
            {t(relevanceLabel)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {t(labels.pageUi.repereQualitatifDeriveDuNiveauDePreuveDeLaSurveillanceEtDesContreIndic)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
          <div className="text-xs text-gray-500">{t(labels.pageUi.surveillance)}</div>
          <div className="text-sm font-semibold text-amber-600">
            {t(surveillanceLabel)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {monitoringItems.length > 0
              ? t(labels.pageUi.monitoringCount).replace("{count}", monitoringItems.length.toLocaleString(uiLocale))
              : t(labels.pageUi.aucunPointDeSurveillanceDetailleFourni)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
          <div className="text-xs text-gray-500">{t(labels.pageUi.sourceDuContenu)}</div>
          <div className="text-sm font-semibold text-gray-900">
            {t(sourceLabel)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {t(labels.pageUi.cetteFicheReprendLeContexteDuTraitementAfficheDansLaPageClinique)}</p>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs text-sm text-gray-700 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">
          {t(labels.pageUi.commentInterpreterCesInformations)}</h2>
        <p>
          {treatment.details ??
            treatment.summary ??
            treatment.indication ??
            t(labels.pageUi.aucunDetailSupplementaireFourniPourCetteOption)}
        </p>
        {treatment.dosage || treatment.duration ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase text-gray-500">
                {t(labels.pageUi.posologie)}</div>
              <div>{treatment.dosage || t(labels.pageUi.nonPrecisee)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-gray-500">
                {t(labels.pageUi.duree)}</div>
              <div>{treatment.duration || t(labels.pageUi.nonPrecisee)}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">
            {t(labels.pageUi.contreIndications)}</h2>
          {contraindicationItems.length > 0 ? (
            <ul className="list-disc ml-4 space-y-1 text-sm text-gray-700">
              {contraindicationItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              {t(labels.pageUi.aucuneContreIndicationDetailleeFournie)}</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">
            {t(labels.pageUi.pointsDeSurveillance)}</h2>
          {monitoringItems.length > 0 ? (
            <ul className="list-disc ml-4 space-y-1 text-sm text-gray-700">
              {monitoringItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              {t(labels.pageUi.aucunPointDeSurveillanceDetailleFourni)}</p>
          )}
        </div>
      </section>

      <Link to="/results" className="text-primary text-sm hover:underline">
        {t(labels.pageUi.retourAuxResultats)}</Link>
    </div>
  );
};

export default TreatmentDetails;
