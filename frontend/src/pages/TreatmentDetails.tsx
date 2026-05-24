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
    return "Pertinence clinique elevee";
  }

  if (evidenceLevel === "A" || evidenceLevel === "B") {
    if (monitoringCount >= 2 || contraindicationCount >= 2) {
      return "Option pertinente avec vigilance";
    }
    return "Option cliniquement solide";
  }

  if (flags.includes("wellTolerated") && flags.includes("monitoring")) {
    return "A evaluer selon le contexte";
  }

  if (flags.includes("wellTolerated")) {
    return "Option courante";
  }

  if (flags.includes("monitoring")) {
    return "Option a surveiller";
  }

  return "A discuter";
}

function getSourceLabel(sourceMode?: string, realAI?: boolean) {
  if (sourceMode === "real") {
    return realAI
      ? "Reponse OpenAI reelle"
      : "Reponse OpenAI reelle mise en cache";
  }

  if (sourceMode === "degraded") {
    return "Reponse degradee de secours";
  }

  if (sourceMode === "mock") {
    return "Donnees simulees";
  }

  return "Contexte clinique genere";
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
          Traitement introuvable.
        </p>
        <Link to="/results" className="text-primary text-sm hover:underline">
          &larr; Retour aux résultats
        </Link>
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
      ? "Surveillance renforcee"
      : monitoringItems.length === 1 || flags.includes("monitoring")
      ? "Surveillance ciblee"
      : "Surveillance standard";

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          {sourceLabel}
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">
          {treatment.name}
        </h1>
        <p className="text-sm text-gray-600">{treatment.class ?? "Traitement"}</p>
      </div>

      <section className="grid sm:grid-cols-3 gap-4 text-sm">
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Pertinence clinique</div>
          <div className="text-lg font-semibold text-primary">
            {relevanceLabel}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Repere qualitatif derive du niveau de preuve, de la surveillance et des contre-indications.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Surveillance</div>
          <div className="text-sm font-semibold text-amber-600">
            {surveillanceLabel}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {monitoringItems.length > 0
              ? `${monitoringItems.length} point(s) de surveillance identifie(s).`
              : "Aucun point de surveillance detaille fourni."}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">Source du contenu</div>
          <div className="text-sm font-semibold text-gray-900">
            {sourceLabel}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Cette fiche reprend le contexte du traitement affiche dans la page clinique.
          </p>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-sm text-gray-700 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Comment interpréter ces informations ?
        </h2>
        <p>
          {treatment.details ??
            treatment.summary ??
            treatment.indication ??
            "Aucun detail supplementaire fourni pour cette option."}
        </p>
        {treatment.dosage || treatment.duration ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase text-gray-500">
                Posologie
              </div>
              <div>{treatment.dosage || "Non precisee"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-gray-500">
                Duree
              </div>
              <div>{treatment.duration || "Non precisee"}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">
            Contre-indications
          </h2>
          {contraindicationItems.length > 0 ? (
            <ul className="list-disc ml-4 space-y-1 text-sm text-gray-700">
              {contraindicationItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              Aucune contre-indication detaillee fournie.
            </p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">
            Points de surveillance
          </h2>
          {monitoringItems.length > 0 ? (
            <ul className="list-disc ml-4 space-y-1 text-sm text-gray-700">
              {monitoringItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              Aucun point de surveillance detaille fourni.
            </p>
          )}
        </div>
      </section>

      <Link to="/results" className="text-primary text-sm hover:underline">
        &larr; Retour aux résultats
      </Link>
    </div>
  );
};

export default TreatmentDetails;
