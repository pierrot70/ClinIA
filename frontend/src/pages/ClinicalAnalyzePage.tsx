import { useEffect, useState, useContext } from "react";
import { Link } from "react-router-dom";
import {
    lookupClinicianReplies,
    type ClinicianComment,
} from "../services/clinicianCommentsApi";
import { ClinicalForm } from "../components/clinical/ClinicalForm";
// import { ClinicalResultPage } from "./ClinicalResultPage";
import ClinicalDemoResult from "../components/ClinicalDemoResult";
import ClinicalRelevanceByAgeChart from "../components/ClinicalRelevanceByAgeChart";
import { useClinicalAnalysis } from "../hooks/useClinicalAnalysis";
import {
    acknowledgeSecurityIncident,
    REQUIRED_ACK_ACTION,
} from "../services/securityIncidentApi";
import { SecurityBlockingAlert } from "../components/system/SecurityBlockingAlert";
import { SecurityNeutralizationReview } from "../components/system/SecurityNeutralizationReview";

import { useTranslation } from "../hooks/useTranslation";
import { getClinicalDemoScenario } from "../data/clinicalDemoScenarios";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { labels } from "../i18n/uiLabels";
import { getClinicalResultStrings } from "../i18n/clinicalResultStrings";

import type { ClinicalPayload } from "../types/clinical";
import type {
    ApiResponse,
    ApiError,
    SecurityIncidentBlockingData,
} from "../types/api";
import { useAuth } from "../hooks/useAuth";
import { isAdminRole } from "../auth/roles";
import { copyToClipboard } from "../utils/copyToClipboard";
import { clearLegacyClinicalBrowserStorage } from "../utils/clinicalBrowserStorage";

type OpenAIModel = "gpt-4.1-mini" | "gpt-4-0613";
const DEFAULT_OPENAI_MODEL: OpenAIModel = "gpt-4.1-mini";
const REQUEST_BOUNDARY_ERROR_CODES = new Set([
    "INVALID_CLINICAL_REQUEST_SHAPE",
    "INVALID_CLINICAL_INPUT_BOUNDARY",
    "CLINICAL_REQUEST_TOO_LARGE",
    "ANONYMOUS_CLINICAL_DEMO_RATE_LIMITED",
]);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ClinicalAnalyzePage() {
    const COMMENT_TRACKING_STORAGE_KEY = "clinia_comment_tracking";
    const { user } = useAuth();
    const canConfigureAi = isAdminRole(user?.role);
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const clinicalResultStrings = getClinicalResultStrings(targetLang);
    const clinicalIntroLabels = labels.clinicalDemo.intro;
    const cloudContentGuardLabels = labels.clinicalDemo.cloudContentGuard;
    const requestBoundaryLabels = cloudContentGuardLabels.requestBoundary;
    const [openaiModel, setOpenaiModel] = useState<OpenAIModel>(DEFAULT_OPENAI_MODEL);
    const effectiveOpenaiModel = canConfigureAi ? openaiModel : DEFAULT_OPENAI_MODEL;
    const isProd = !!import.meta.env.PROD;
    const [activeTab, setActiveTab] =
        useState<"patient" | "clinical">("patient");

    const {
        result,
        loading,
        error,
        errorCode,
        errorFields,
        analyze,
        resetAnalysis,
    } = useClinicalAnalysis();
    const {
        result: comparisonResultOne,
        loading: comparisonLoadingOne,
        error: comparisonErrorOne,
        analyze: analyzeComparisonOne,
        resetAnalysis: resetComparisonOne,
    } = useClinicalAnalysis();
    const {
        result: comparisonResultTwo,
        loading: comparisonLoadingTwo,
        error: comparisonErrorTwo,
        analyze: analyzeComparisonTwo,
        resetAnalysis: resetComparisonTwo,
    } = useClinicalAnalysis();

    const [apiError, setApiError] = useState<ApiError | null>(null);
    const [blockingIncident, setBlockingIncident] =
        useState<SecurityIncidentBlockingData | null>(null);
    const [acknowledgingIncident, setAcknowledgingIncident] =
        useState(false);
    const [blockingActionableMessage, setBlockingActionableMessage] =
        useState<string | null>(null);
    const [pendingNeutralizationReview, setPendingNeutralizationReview] = useState<{
        payload: ClinicalPayload;
        preview: NonNullable<
            SecurityIncidentBlockingData["incident"]["sanitizationPreview"]
        >;
    } | null>(null);
    const [serviceMode, setServiceMode] =
        useState<"real" | "mock" | "degraded" | null>(null);
    const [reverifyLoading, setReverifyLoading] = useState(false);
    const [copyRequestFeedback, setCopyRequestFeedback] = useState<string | null>(null);

    const [forceReal, setForceReal] = useState(false);

    const [lastPayload, setLastPayload] =
        useState<ClinicalPayload | null>(null);
    const [comparisonPayloads, setComparisonPayloads] = useState<{
        first: ClinicalPayload;
        second: ClinicalPayload;
    } | null>(null);
    const [replyLookupName, setReplyLookupName] = useState("");
    const [replyLookupCode, setReplyLookupCode] = useState("");
    const [replyLookupLoading, setReplyLookupLoading] = useState(false);
    const [replyLookupError, setReplyLookupError] = useState("");
    const [replyLookupItems, setReplyLookupItems] = useState<ClinicianComment[]>([]);
    const [commentPanelOpen, setCommentPanelOpen] = useState(false);
    const [replyLookupOpen, setReplyLookupOpen] = useState(false);
    const [mobileComparisonSection, setMobileComparisonSection] = useState<
        "quick" | "focus" | null
    >(null);
    const demoScenario = getClinicalDemoScenario(lastPayload);
    const { translated: introTaglineLabel } = useTranslation({
        text: clinicalIntroLabels.tagline,
        targetLang,
        translationKey: "clinicalDemo.intro.tagline",
    });
    const { translated: introSubtitleLabel } = useTranslation({
        text: clinicalIntroLabels.subtitle,
        targetLang,
        translationKey: "clinicalDemo.intro.subtitle",
    });

    useEffect(() => {
        clearLegacyClinicalBrowserStorage();
    }, []);
    const shouldRestoreFormForCorrection =
        errorCode === "UNAPPROVED_CLOUD_CLINICAL_CONTENT" ||
        (typeof errorCode === "string" && REQUEST_BOUNDARY_ERROR_CODES.has(errorCode));
    const requestBoundaryMessage =
        typeof errorCode === "string" && REQUEST_BOUNDARY_ERROR_CODES.has(errorCode)
            ? requestBoundaryLabels.messages[
                  errorCode as keyof typeof requestBoundaryLabels.messages
              ]
            : null;

    useEffect(() => {
        if (shouldRestoreFormForCorrection) {
            setActiveTab("patient");
        }
    }, [shouldRestoreFormForCorrection]);
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(COMMENT_TRACKING_STORAGE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as {
                guestDisplayName?: string;
                trackingCode?: string;
            };
            if (parsed.guestDisplayName) {
                setReplyLookupName(parsed.guestDisplayName);
            }
            if (parsed.trackingCode) {
                setReplyLookupCode(parsed.trackingCode);
            }
        } catch {
            // Ignore local storage errors.
        }
    }, []);
    useEffect(() => {
        if (!canConfigureAi) {
            localStorage.removeItem("clinia_force_real");
            setForceReal(false);
            setOpenaiModel(DEFAULT_OPENAI_MODEL);
            return;
        }
        if (isProd) {
            localStorage.removeItem("clinia_force_real");
            setForceReal(false);
            return;
        }
        const stored = localStorage.getItem("clinia_force_real");
        setForceReal(stored === "true");

        const handleForceRealChange = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail && typeof detail.forceReal === "boolean") {
                setForceReal(detail.forceReal);
            }
        };
        window.addEventListener(
            "clinia:force-real-changed",
            handleForceRealChange
        );
        return () => {
            window.removeEventListener(
                "clinia:force-real-changed",
                handleForceRealChange
            );
        };
    }, [canConfigureAi, isProd]);

    /* ------------------------------------------------------------------ */
    /* 🔁 Changement de modèle → retour au formulaire                     */
    /* ------------------------------------------------------------------ */

    function handleModelChange(model: OpenAIModel) {
        setOpenaiModel(model);

        // RESET UI volontaire et explicite
        setApiError(null);
        setServiceMode(null);
        setLastPayload(null);
        setActiveTab("patient");
    }

    /* ------------------------------------------------------------------ */
    /* Analyse centrale                                                   */
    /* ------------------------------------------------------------------ */

    // runAnalysis remplacé par le hook useClinicalAnalysis

    async function handleAcknowledgeBlockingIncident() {
        if (!blockingIncident) {
            setBlockingActionableMessage(
                "Incident de securite manquant. Relancez l'analyse pour continuer."
            );
            return;
        }

        setAcknowledgingIncident(true);
        setBlockingActionableMessage(null);

        const ackResponse = await acknowledgeSecurityIncident({
            incidentId: blockingIncident.incident.id,
            action: REQUIRED_ACK_ACTION,
            context: {
                route: "/clinical",
                flow: "clinical_analysis",
                incidentType: blockingIncident.incident.type,
                incidentReason: blockingIncident.incident.reason,
                incidentPhase: blockingIncident.incident.phase,
                incidentTimestamp: blockingIncident.incident.timestamp,
                incidentContext: blockingIncident.incident.context,
            },
        });

        if ("error" in ackResponse) {
            setBlockingActionableMessage(
                ackResponse.error.message ||
                    "Impossible d'enregistrer la confirmation de securite. Reessayez ou contactez l'administrateur."
            );
            setAcknowledgingIncident(false);
            return;
        }

        setBlockingIncident(null);
        setApiError(null);
        const acknowledgedPayload = lastPayload
            ? {
                  ...lastPayload,
                  incidentAckId: blockingIncident.incident.id,
              }
            : null;
        const sanitizationPreview = blockingIncident.incident.sanitizationPreview;

        if (!acknowledgedPayload) {
            setBlockingActionableMessage(
                "Confirmation enregistree. Relancez l'analyse pour continuer."
            );
            setAcknowledgingIncident(false);
            return;
        }

        if (sanitizationPreview && Object.keys(sanitizationPreview).length > 0) {
            setPendingNeutralizationReview({
                payload: acknowledgedPayload,
                preview: sanitizationPreview,
            });
            setBlockingActionableMessage(null);
            setAcknowledgingIncident(false);
            return;
        }

        setLastPayload(acknowledgedPayload);
        setBlockingActionableMessage(
            "Confirmation enregistree. Analyse relancee avec le meme contenu."
        );
        const replayBlockingIncident = await analyze(acknowledgedPayload);
        if (replayBlockingIncident) {
            setBlockingIncident(replayBlockingIncident);
        }
        setAcknowledgingIncident(false);
    }

    async function continueWithNeutralizedPayload() {
        if (!pendingNeutralizationReview) {
            return;
        }

        const { payload } = pendingNeutralizationReview;
        setPendingNeutralizationReview(null);
        setLastPayload(payload);
        setBlockingActionableMessage(
            "Analyse relancee avec les parametres corriges."
        );
        const replayBlockingIncident = await analyze(payload);
        if (replayBlockingIncident) {
            setBlockingIncident(replayBlockingIncident);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Soumission utilisateur                                             */
    /* ------------------------------------------------------------------ */

    async function handleSubmit(payload: ClinicalPayload) {
        setReverifyLoading(false);
        setCopyRequestFeedback(null);
        setComparisonPayloads(null);
        resetComparisonOne();
        resetComparisonTwo();
        const safePayload = {
            ...payload,
            forceReal: isProd || !canConfigureAi ? false : forceReal,
            openaiModel: effectiveOpenaiModel,
        };
        setLastPayload(safePayload);
        setActiveTab("clinical");
        const nextBlockingIncident = await analyze(safePayload);
        if (nextBlockingIncident) {
            setBlockingIncident(nextBlockingIncident);
        }
    }

    async function handleCompareSubmit(
        firstPayload: ClinicalPayload,
        secondPayload: ClinicalPayload
    ) {
        setCopyRequestFeedback(null);
        resetAnalysis();
        setApiError(null);
        setBlockingIncident(null);
        setBlockingActionableMessage(null);
        setServiceMode(null);

        const safeFirstPayload = {
            ...firstPayload,
            forceReal: isProd || !canConfigureAi ? false : forceReal,
            openaiModel: effectiveOpenaiModel,
        };
        const safeSecondPayload = {
            ...secondPayload,
            forceReal: isProd || !canConfigureAi ? false : forceReal,
            openaiModel: effectiveOpenaiModel,
        };

        setComparisonPayloads({
            first: safeFirstPayload,
            second: safeSecondPayload,
        });
        setLastPayload(safeFirstPayload);
        setActiveTab("clinical");

        await Promise.all([
            analyzeComparisonOne(safeFirstPayload),
            analyzeComparisonTwo(safeSecondPayload),
        ]);
    }

    async function handleReverifyAnalysis() {
        if (!lastPayload || user?.role !== "SUPERADMIN") {
            return;
        }

        setReverifyLoading(true);
        setApiError(null);
        setBlockingIncident(null);
        setBlockingActionableMessage(null);

        await analyze({
            ...lastPayload,
            reverifyRequested: true,
            forceReal: true,
            openaiModel,
        });

        setReverifyLoading(false);
    }

    async function handleReverifyComparison() {
        if (!comparisonPayloads || user?.role !== "SUPERADMIN") {
            return;
        }

        setReverifyLoading(true);
        setApiError(null);
        setBlockingIncident(null);
        setBlockingActionableMessage(null);

        await Promise.all([
            analyzeComparisonOne({
                ...comparisonPayloads.first,
                reverifyRequested: true,
                forceReal: true,
                openaiModel,
            }),
            analyzeComparisonTwo({
                ...comparisonPayloads.second,
                reverifyRequested: true,
                forceReal: true,
                openaiModel,
            }),
        ]);

        setReverifyLoading(false);
    }

    async function handleCopyClinicalRequest() {
        if (!lastPayload) {
            return;
        }

        const {
            forceReal: _forceReal,
            openaiModel: _openaiModel,
            reverifyRequested: _reverifyRequested,
            ...debugPayload
        } = lastPayload;

        try {
            await copyToClipboard(JSON.stringify(debugPayload, null, 2));
            setCopyRequestFeedback("Requete JSON copiee dans le presse-papiers.");
        } catch {
            setCopyRequestFeedback(
                "Impossible de copier automatiquement. Reessayez ou contactez un SUPERADMIN."
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /* Retry                                                             */
    /* ------------------------------------------------------------------ */

    function retry() {
        if (lastPayload) {
            analyze({
                ...lastPayload,
                forceReal,
                openaiModel,
            });
            setActiveTab("clinical");
        }
    }

    function handleBackToClinicalDemo() {
        resetAnalysis();
        resetComparisonOne();
        resetComparisonTwo();
        setApiError(null);
        setBlockingIncident(null);
        setBlockingActionableMessage(null);
        setServiceMode(null);
        setComparisonPayloads(null);
        setActiveTab("patient");
    }

    function handleCorrectRejectedFields() {
        const fieldElementIds: Record<string, string> = {
            diagnosis: "clinical-diagnosis",
            symptoms: "clinical-symptoms",
            medical_history: "clinical-medical-history",
            current_medications: "clinical-current-medications",
        };
        const firstFieldId = errorFields
            .map((field) => fieldElementIds[field])
            .find(Boolean);

        resetAnalysis();

        if (!firstFieldId) {
            return;
        }

        window.setTimeout(() => {
            const field = document.getElementById(firstFieldId);
            field?.scrollIntoView?.({ behavior: "smooth", block: "center" });
            field?.focus();
        }, 0);
    }

    async function handleLookupReplies(event: React.FormEvent) {
        event.preventDefault();
        setReplyLookupLoading(true);
        setReplyLookupError("");

        const response = await lookupClinicianReplies(replyLookupName, replyLookupCode);
        setReplyLookupLoading(false);

        if (!response.ok) {
            setReplyLookupItems([]);
            setReplyLookupError(response.error.message);
            return;
        }

        setReplyLookupItems(response.data.items || []);
        if ((response.data.items || []).length === 0) {
            setReplyLookupError(noRepliesFoundLabel);
        }
    }

    const toggleForceReal = () => {
        if (!canConfigureAi || isProd) {
            return;
        }
        const next = !forceReal;
        setForceReal(next);
        localStorage.setItem("clinia_force_real", String(next));
        window.dispatchEvent(
            new CustomEvent("clinia:force-real-changed", {
                detail: { forceReal: next },
            })
        );
    };

    const comparisonLoading = comparisonLoadingOne || comparisonLoadingTwo;
    const isComparisonMode = comparisonPayloads !== null;
    const comparisonScenarioOne = getClinicalDemoScenario(comparisonPayloads?.first);
    const comparisonScenarioTwo = getClinicalDemoScenario(comparisonPayloads?.second);

    function buildComparisonHeading(label: string, payload: ClinicalPayload) {
        return `${label} - ${payload.diagnosis || comparisonLabels.fallbackHeading}${
            payload.age ? `, ${payload.age} ans` : ""
        }`;
    }

    function formatComparisonValue(value?: string | number) {
        if (value === undefined || value === null || value === "") {
            return comparisonLabels.quickViewNotSpecified;
        }
        return String(value);
    }

    function formatSexLabel(value?: ClinicalPayload["sex"]) {
        if (value === "male") {
            return "Homme";
        }
        if (value === "female") {
            return "Femme";
        }
        if (value === "other") {
            return "Autre";
        }
        return comparisonLabels.quickViewNotSpecified;
    }

    function buildQuickFact(
        label: string,
        first: string,
        second: string,
        options?: { majorDifference?: boolean }
    ) {
        const isDifferent = first !== second;
        return {
            label,
            first,
            second,
            isDifferent,
            badge: isDifferent
                ? options?.majorDifference
                    ? comparisonLabels.quickViewMajorDifferenceBadge
                    : comparisonLabels.quickViewDifferenceBadge
                : null,
        };
    }

    function buildMicroSummary(payload: ClinicalPayload) {
        const fragility = payload.diabetes_context?.fragility?.toLowerCase() || "";
        const cardioRisk =
            payload.diabetes_context?.cardiovascular_risk?.toLowerCase() || "";
        const renalFunction =
            payload.diabetes_context?.renal_function?.toLowerCase() || "";

        const profileParts: string[] = [
            payload.age >= 75
                ? comparisonLabels.microSummaryAgeOlder
                : comparisonLabels.microSummaryAgeYounger,
        ];

        if (fragility.includes("elev")) {
            profileParts.push(comparisonLabels.microSummaryFragilityHigh);
        } else if (fragility.includes("faible")) {
            profileParts.push(comparisonLabels.microSummaryFragilityLow);
        } else {
            profileParts.push(comparisonLabels.microSummaryFragilityNeutral);
        }

        if (cardioRisk.includes("tres eleve") || cardioRisk.includes("haut")) {
            profileParts.push(comparisonLabels.microSummaryCardioHigh);
        } else if (cardioRisk.includes("modere") || cardioRisk.includes("eleve")) {
            profileParts.push(comparisonLabels.microSummaryCardioModerate);
        } else {
            profileParts.push(comparisonLabels.microSummaryCardioNeutral);
        }

        let priority: string = comparisonLabels.microSummaryPriorityGlycemia;
        if (cardioRisk.includes("tres eleve") || cardioRisk.includes("haut")) {
            priority = comparisonLabels.microSummaryPriorityCardio;
        } else if (fragility.includes("elev")) {
            priority = comparisonLabels.microSummaryPriorityFrailty;
        }

        let caution: string = comparisonLabels.microSummaryCautionGeneral;
        if (renalFunction.includes("reduction") || renalFunction.includes("moderee")) {
            caution = comparisonLabels.microSummaryCautionRenal;
        } else if (fragility.includes("elev")) {
            caution = comparisonLabels.microSummaryCautionFrailty;
        }

        return [
            `${comparisonLabels.microSummaryProfilePrefix}: ${profileParts.join(", ")}`,
            `${comparisonLabels.microSummaryPriorityPrefix}: ${priority}`,
            `${comparisonLabels.microSummaryCautionPrefix}: ${caution}`,
        ];
    }

    function buildPrimaryAlert(payload: ClinicalPayload) {
        const fragility = payload.diabetes_context?.fragility?.toLowerCase() || "";
        const cardioRisk =
            payload.diabetes_context?.cardiovascular_risk?.toLowerCase() || "";
        const renalFunction =
            payload.diabetes_context?.renal_function?.toLowerCase() || "";

        if (renalFunction.includes("reduction") || renalFunction.includes("moderee")) {
            return {
                icon: comparisonLabels.primaryAlertKidneyIcon,
                message: comparisonLabels.primaryAlertKidney,
            };
        }

        if (fragility.includes("elev")) {
            return {
                icon: comparisonLabels.primaryAlertFrailtyIcon,
                message: comparisonLabels.primaryAlertFrailty,
            };
        }

        if (cardioRisk.includes("tres eleve") || cardioRisk.includes("haut")) {
            return {
                icon: comparisonLabels.primaryAlertCardioIcon,
                message: comparisonLabels.primaryAlertCardio,
            };
        }

        return {
            icon: comparisonLabels.primaryAlertGeneralIcon,
            message: comparisonLabels.primaryAlertGeneral,
        };
    }

    /* ------------------------------------------------------------------ */
    /* Render                                                             */
    /* ------------------------------------------------------------------ */

    // Traductions dynamiques
    const { translated: modelLabel, loading: loadingModel, error: errorModel } = useTranslation({ text: labels.clinicalDemo.form.openAiModelLabel, targetLang, translationKey: "clinicalDemo.form.openAiModelLabel" });
    const { translated: gptMiniLabel, loading: loadingMini, error: errorMini } = useTranslation({ text: "gpt-4.1-mini (JSON natif)", targetLang, openaiModel: effectiveOpenaiModel });
    const { translated: gptLegacyLabel, loading: loadingLegacy, error: errorLegacy } = useTranslation({ text: "gpt-4-0613 (legacy)", targetLang, openaiModel: effectiveOpenaiModel });
    const { translated: realIaLabel, loading: loadingReal, error: errorReal } = useTranslation({ text: "IA réelle activée", targetLang, openaiModel: effectiveOpenaiModel });
    const { translated: simModeLabel, loading: loadingSim, error: errorSim } = useTranslation({ text: labels.clinicalDemo.form.simulationMode, targetLang, translationKey: "clinicalDemo.form.simulationMode" });
    const { translated: backendErrorLabel, loading: loadingBackend, error: errorBackend } = useTranslation({ text: "Erreur backend brute (sans flafla)", targetLang, openaiModel: effectiveOpenaiModel });
    const { translated: loadingLabel } = useTranslation({ text: "Chargement...", targetLang, openaiModel: effectiveOpenaiModel });
    const commentLabels = labels.clinicalDemo.comments;
    const comparisonLabels = labels.clinicalDemo.comparison;
    const comparisonQuickFacts = comparisonPayloads
        ? [
              buildQuickFact(
                  comparisonLabels.quickViewAgeLabel,
                  formatComparisonValue(comparisonPayloads.first.age),
                  formatComparisonValue(comparisonPayloads.second.age),
                  {
                      majorDifference:
                          Math.abs(
                              Number(comparisonPayloads.first.age) -
                                  Number(comparisonPayloads.second.age)
                          ) >= 15,
                  }
              ),
              buildQuickFact(
                  comparisonLabels.quickViewSexLabel,
                  formatSexLabel(comparisonPayloads.first.sex),
                  formatSexLabel(comparisonPayloads.second.sex)
              ),
              buildQuickFact(
                  comparisonLabels.quickViewCardioRiskLabel,
                  formatComparisonValue(
                      comparisonPayloads.first.diabetes_context?.cardiovascular_risk
                  ),
                  formatComparisonValue(
                      comparisonPayloads.second.diabetes_context?.cardiovascular_risk
                  )
              ),
              buildQuickFact(
                  comparisonLabels.quickViewRenalLabel,
                  formatComparisonValue(
                      comparisonPayloads.first.diabetes_context?.renal_function
                  ),
                  formatComparisonValue(
                      comparisonPayloads.second.diabetes_context?.renal_function
                  )
              ),
              buildQuickFact(
                  comparisonLabels.quickViewFragilityLabel,
                  formatComparisonValue(
                      comparisonPayloads.first.diabetes_context?.fragility
                  ),
                  formatComparisonValue(
                      comparisonPayloads.second.diabetes_context?.fragility
                  )
              ),
          ]
        : [];
    const mobileQuickFacts = comparisonQuickFacts.slice(0, 3);

    function toggleMobileComparisonSection(section: "quick" | "focus") {
        setMobileComparisonSection((current) =>
            current === section ? null : section
        );
    }
    const { translated: leaveCommentLabel, loading: loadingLeaveComment, error: errorLeaveComment } = useTranslation({ text: commentLabels.leaveComment, targetLang, translationKey: "clinicalDemo.comments.leaveComment" });
    const { translated: leaveCommentTooltipLabel } = useTranslation({ text: commentLabels.leaveCommentTooltip, targetLang, openaiModel });
    const { translated: openaiModelTooltipLabel } = useTranslation({ text: commentLabels.openaiModelTooltip, targetLang, openaiModel });
    const { translated: replyLookupTitleLabel, loading: loadingReplyLookupTitle, error: errorReplyLookupTitle } = useTranslation({ text: commentLabels.replyLookupTitle, targetLang, translationKey: "clinicalDemo.comments.replyLookupTitle" });
    const { translated: replyLookupDescriptionLabel, loading: loadingReplyLookupDescription, error: errorReplyLookupDescription } = useTranslation({ text: commentLabels.replyLookupDescription, targetLang, openaiModel });
    const { translated: namePlaceholderLabel } = useTranslation({ text: commentLabels.namePlaceholder, targetLang, openaiModel });
    const { translated: trackingCodePlaceholderLabel } = useTranslation({ text: commentLabels.trackingCodePlaceholder, targetLang, openaiModel });
    const { translated: searchLoadingLabel, loading: loadingSearchLoading, error: errorSearchLoading } = useTranslation({ text: commentLabels.searchLoading, targetLang, openaiModel });
    const { translated: viewRepliesLabel, loading: loadingViewReplies, error: errorViewReplies } = useTranslation({ text: commentLabels.viewReplies, targetLang, openaiModel });
    const { translated: viewRepliesTooltipLabel } = useTranslation({ text: commentLabels.viewRepliesTooltip, targetLang, openaiModel });
    const { translated: noRepliesFoundLabel } = useTranslation({ text: commentLabels.noRepliesFound, targetLang, openaiModel });
    const { translated: commentCreatedAtPrefixLabel } = useTranslation({ text: commentLabels.commentCreatedAtPrefix, targetLang, openaiModel });
    const { translated: replyFromPrefixLabel } = useTranslation({ text: commentLabels.replyFromPrefix, targetLang, openaiModel });
    const { translated: replyFromSeparatorLabel } = useTranslation({ text: commentLabels.replyFromSeparator, targetLang, openaiModel });

        // Affichage loading/erreur pour la traduction dynamique
        const [showTranslationError, setShowTranslationError] = useState<string | null>(null);
        useEffect(() => {
            if (errorModel) setShowTranslationError(errorModel);
            else if (errorMini) setShowTranslationError(errorMini);
            else if (errorLegacy) setShowTranslationError(errorLegacy);
            else if (errorReal) setShowTranslationError(errorReal);
            else if (errorSim) setShowTranslationError(errorSim);
            else if (errorBackend) setShowTranslationError(errorBackend);
            else if (errorLeaveComment) setShowTranslationError(errorLeaveComment);
            else if (errorReplyLookupTitle) setShowTranslationError(errorReplyLookupTitle);
            else if (errorReplyLookupDescription) setShowTranslationError(errorReplyLookupDescription);
            else if (errorSearchLoading) setShowTranslationError(errorSearchLoading);
            else if (errorViewReplies) setShowTranslationError(errorViewReplies);
            else setShowTranslationError(null);
        }, [
            errorModel,
            errorMini,
            errorLegacy,
            errorReal,
            errorSim,
            errorBackend,
            errorLeaveComment,
            errorReplyLookupTitle,
            errorReplyLookupDescription,
            errorSearchLoading,
            errorViewReplies,
        ]);

        const renderLabel = (label: string, loading: boolean, error?: string) => {
            if (loading) return <span style={{ opacity: 0.6 }}>{loadingLabel}</span>;
            return label;
        };

        return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            {showTranslationError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                        <h2 className="text-lg font-semibold text-red-700 mb-2">Translation error</h2>
                        <p className="text-sm text-gray-800 mb-4">{showTranslationError}</p>
                        <button className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700" onClick={() => setShowTranslationError(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
            {blockingIncident && (
                <SecurityBlockingAlert
                    blocking={blockingIncident}
                    actionableMessage={blockingActionableMessage}
                    acknowledging={acknowledgingIncident}
                    onAcknowledge={handleAcknowledgeBlockingIncident}
                />
            )}
            {pendingNeutralizationReview && (
                <SecurityNeutralizationReview
                    originalPayload={pendingNeutralizationReview.payload}
                    preview={pendingNeutralizationReview.preview}
                    labels={cloudContentGuardLabels.neutralizationReview}
                    onContinue={() => void continueWithNeutralizedPayload()}
                    onCancel={() => setPendingNeutralizationReview(null)}
                />
            )}

            {/* ❌ Erreur backend brute (sans flafla) */}
            {apiError && (
                <div className="text-red-600 text-sm">
                    {backendErrorLabel}
                </div>
            )}

            <section className="overflow-hidden rounded-lg border border-sky-950 bg-sky-950 shadow-md">
                <div className="flex items-stretch">
                    <div className="w-2 shrink-0 bg-lime-400" aria-hidden="true" />
                    <div className="px-5 py-5 md:px-7 md:py-6">
                        <h1 className="text-xl font-semibold text-white md:text-2xl">
                            {introTaglineLabel}
                        </h1>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100 md:text-base">
                            {introSubtitleLabel}
                        </p>
                    </div>
                </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-sky-200 bg-sky-50">
                <button
                    type="button"
                    onClick={() => setCommentPanelOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-sky-100"
                    aria-expanded={commentPanelOpen}
                >
                    <span className="text-sm font-semibold text-sky-900">
                        {renderLabel(leaveCommentLabel, loadingLeaveComment, errorLeaveComment ?? undefined)}
                    </span>
                    <span className="text-xl font-semibold text-sky-700" aria-hidden="true">
                        {commentPanelOpen ? "−" : "+"}
                    </span>
                </button>
                {commentPanelOpen && (
                    <div className="border-t border-sky-200 bg-white px-4 py-4">
                        <p className="text-sm text-sky-950">
                            {leaveCommentTooltipLabel}
                        </p>
                        <Link
                            to="/comments"
                            className="mt-3 inline-flex rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800"
                        >
                            {renderLabel(leaveCommentLabel, loadingLeaveComment, errorLeaveComment ?? undefined)}
                        </Link>
                    </div>
                )}
            </section>

            <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
                <button
                    type="button"
                    onClick={() => setReplyLookupOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-amber-100"
                    aria-expanded={replyLookupOpen}
                >
                    <div>
                        <h2 className="text-sm font-semibold text-amber-950">
                            {renderLabel(replyLookupTitleLabel, loadingReplyLookupTitle, errorReplyLookupTitle ?? undefined)}
                        </h2>
                    </div>
                    <span className="text-xl font-semibold text-amber-700" aria-hidden="true">
                        {replyLookupOpen ? "−" : "+"}
                    </span>
                </button>
                {replyLookupOpen ? (
                    <div className="border-t border-amber-200 bg-white px-4 py-4">
                        <div className="mb-3">
                            <p className="text-sm text-amber-900">
                                {renderLabel(replyLookupDescriptionLabel, loadingReplyLookupDescription, errorReplyLookupDescription ?? undefined)}
                            </p>
                        </div>
                        <form onSubmit={handleLookupReplies} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                            <input
                                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                placeholder={namePlaceholderLabel}
                                value={replyLookupName}
                                onChange={(event) => setReplyLookupName(event.target.value)}
                            />
                            <input
                                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm uppercase outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                placeholder={trackingCodePlaceholderLabel}
                                value={replyLookupCode}
                                onChange={(event) => setReplyLookupCode(event.target.value.toUpperCase())}
                                maxLength={8}
                            />
                            <div className="group relative inline-flex">
                                <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-3 hidden w-80 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs font-normal leading-5 text-amber-950 shadow-xl group-hover:block">
                                    {viewRepliesTooltipLabel}
                                    <span
                                        className="absolute right-6 top-full h-3 w-3 -translate-y-1/2 rotate-45 border-b border-r border-amber-200 bg-amber-50"
                                        aria-hidden="true"
                                    />
                                </span>
                                <button
                                    type="submit"
                                    disabled={replyLookupLoading}
                                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {replyLookupLoading
                                        ? renderLabel(searchLoadingLabel, loadingSearchLoading, errorSearchLoading ?? undefined)
                                        : renderLabel(viewRepliesLabel, loadingViewReplies, errorViewReplies ?? undefined)}
                                </button>
                            </div>
                        </form>
                        {replyLookupError && (
                            <div className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-amber-900">
                                {replyLookupError}
                            </div>
                        )}
                        {replyLookupItems.length > 0 && (
                            <div className="mt-4 space-y-3">
                                {replyLookupItems.map((item) => (
                                    <article key={item.id} className="rounded-lg border border-amber-100 bg-white p-4">
                                        <div className="mb-2 text-xs text-gray-500">
                                            {commentCreatedAtPrefixLabel}{" "}
                                            {new Date(item.createdAt).toLocaleString(targetLang)}
                                        </div>
                                        <p className="whitespace-pre-wrap text-sm text-gray-800">
                                            {item.comment}
                                        </p>
                                        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                                            {item.replies.map((reply) => (
                                                <div key={reply.id} className="rounded-lg bg-amber-50 p-3">
                                                    <div className="mb-1 text-xs text-gray-500">
                                                        {replyFromPrefixLabel} {reply.responderUsername}{" "}
                                                        {replyFromSeparatorLabel}{" "}
                                                        {new Date(reply.createdAt).toLocaleString(targetLang)}
                                                    </div>
                                                    <p className="whitespace-pre-wrap text-sm text-gray-800">
                                                        {reply.message}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </section>

            {!blockingIncident && blockingActionableMessage && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {blockingActionableMessage}
                </div>
            )}

            {canConfigureAi && (
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium">
                        {renderLabel(modelLabel, loadingModel, errorModel ?? undefined)}
                    </label>

                    <div className="group relative inline-flex">
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-80 -translate-x-1/2 rounded-xl border border-sky-200 bg-cyan-50 p-3 text-left text-xs font-normal leading-5 text-cyan-950 shadow-xl group-hover:block">
                            {openaiModelTooltipLabel}
                            <span
                                className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-sky-200 bg-cyan-50"
                                aria-hidden="true"
                            />
                        </span>
                        <select
                            value={openaiModel}
                            onChange={(e) =>
                                handleModelChange(
                                    e.target.value as OpenAIModel
                                )
                            }
                            className="border rounded px-2 py-1 text-sm"
                        >
                            <option value="gpt-4.1-mini">
                                {renderLabel(gptMiniLabel, loadingMini, errorMini ?? undefined)}
                            </option>
                            <option value="gpt-4-0613">
                                {renderLabel(gptLegacyLabel, loadingLegacy, errorLegacy ?? undefined)}
                            </option>
                        </select>
                    </div>
                </div>
            )}

            {/* 🔀 Toggle IA réelle */}
            {canConfigureAi && !isProd && (
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={toggleForceReal}
                        disabled={serviceMode === "degraded"}
                        className={`px-3 py-1 rounded text-sm border transition
                            ${
                            forceReal
                                ? "bg-red-600 text-white border-red-600"
                                : "bg-gray-100 text-gray-700 border-gray-300"
                        }
                            ${
                            serviceMode === "degraded"
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                        }
                        `}
                    >
                                                {forceReal
                                                    ? renderLabel(realIaLabel, loadingReal, errorReal ?? undefined)
                                                    : renderLabel(simModeLabel, loadingSim, errorSim ?? undefined)}
                    </button>
                </div>
            )}

            {/* 👨‍⚕️ Formulaire */}
            {activeTab === "patient" && !result && (
                <div className="space-y-4">
                    {errorCode === "UNAPPROVED_CLOUD_CLINICAL_CONTENT" ? (
                        <section
                            className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
                            role="alert"
                            aria-labelledby="cloud-content-guard-title"
                        >
                            <h2
                                id="cloud-content-guard-title"
                                className="text-base font-semibold"
                            >
                                {cloudContentGuardLabels.title}
                            </h2>
                            <p className="mt-2 text-sm leading-6">
                                {cloudContentGuardLabels.description}
                            </p>
                            {errorFields.length > 0 ? (
                                <div className="mt-3 text-sm">
                                    <span className="font-semibold">
                                        {cloudContentGuardLabels.fieldsLabel}
                                    </span>{" "}
                                    {errorFields
                                        .map(
                                            (field) =>
                                                cloudContentGuardLabels.fieldLabels[
                                                    field as keyof typeof cloudContentGuardLabels.fieldLabels
                                                ] || field
                                        )
                                        .join(", ")}
                                </div>
                            ) : null}
                            <button
                                type="button"
                                className="mt-4 rounded border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
                                onClick={handleCorrectRejectedFields}
                            >
                                {cloudContentGuardLabels.action}
                            </button>
                        </section>
                    ) : null}
                    {requestBoundaryMessage ? (
                        <section
                            className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
                            role="alert"
                            aria-labelledby="clinical-request-boundary-title"
                        >
                            <h2
                                id="clinical-request-boundary-title"
                                className="text-base font-semibold"
                            >
                                {requestBoundaryLabels.title}
                            </h2>
                            <p className="mt-2 text-sm leading-6">
                                {requestBoundaryMessage}
                            </p>
                            {errorFields.length > 0 ? (
                                <div className="mt-3 text-sm">
                                    <span className="font-semibold">
                                        {requestBoundaryLabels.fieldsLabel}
                                    </span>{" "}
                                    {errorFields
                                        .map(
                                            (field) =>
                                                cloudContentGuardLabels.fieldLabels[
                                                    field as keyof typeof cloudContentGuardLabels.fieldLabels
                                                ] || field
                                        )
                                        .join(", ")}
                                </div>
                            ) : null}
                            {errorCode !== "ANONYMOUS_CLINICAL_DEMO_RATE_LIMITED" ? (
                                <button
                                    type="button"
                                    className="mt-4 rounded border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
                                    onClick={handleCorrectRejectedFields}
                                >
                                    {requestBoundaryLabels.action}
                                </button>
                            ) : null}
                        </section>
                    ) : null}
                    <ClinicalForm
                        key={targetLang + openaiModel}
                        onSubmit={handleSubmit}
                        onCompareSubmit={handleCompareSubmit}
                        loading={loading}
                        compareLoading={comparisonLoading}
                        highlightFields={
                            shouldRestoreFormForCorrection
                                ? errorFields
                                : []
                        }
                        initialData={
                            shouldRestoreFormForCorrection
                                ? lastPayload || undefined
                                : undefined
                        }
                        restoreInitialDataForCorrection={
                            shouldRestoreFormForCorrection
                        }
                    />
                </div>
            )}

            {/* 📊 Résultat enrichi partagé */}
            {activeTab === "clinical" && (loading || comparisonLoading) && (
                <div className="space-y-4">
                    <div className="flex justify-start">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleBackToClinicalDemo}
                                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                                Retour a /clinical-demo
                            </button>
                            {user?.role === "SUPERADMIN" ? (
                                <button
                                    type="button"
                                    onClick={handleReverifyComparison}
                                    disabled={reverifyLoading}
                                    className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                                >
                                    {reverifyLoading
                                        ? comparisonLabels.reverifyLoading
                                        : comparisonLabels.reverifyAction}
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-lime-200 bg-lime-50/80 p-10 text-center">
                        <div className="clinia-neon-loader" aria-hidden="true" />
                        <div className="clinia-neon-text text-sm font-semibold uppercase tracking-[0.2em]">
                            Requete OpenAI en cours...
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "clinical" && !loading && !comparisonLoading && isComparisonMode && comparisonPayloads && (
                <div className="space-y-4">
                    <div className="flex justify-start">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleBackToClinicalDemo}
                                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                                Retour a /clinical-demo
                            </button>
                            {user?.role === "SUPERADMIN" ? (
                                <button
                                    type="button"
                                    onClick={handleReverifyComparison}
                                    disabled={reverifyLoading}
                                    className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                                >
                                    {reverifyLoading
                                        ? comparisonLabels.reverifyLoading
                                        : comparisonLabels.reverifyAction}
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm md:block hidden">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {comparisonLabels.quickViewTitle}
                        </h2>
                        <p className="mt-1 text-sm text-gray-700">
                            {comparisonLabels.quickViewHelp}
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                            {comparisonQuickFacts.map((fact) => (
                                <article
                                    key={fact.label}
                                    className={`rounded-xl border p-4 ${
                                        fact.isDifferent
                                            ? "border-amber-300 bg-amber-50/70"
                                            : "border-emerald-200 bg-white"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <p
                                            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                                                fact.isDifferent
                                                    ? "text-amber-800"
                                                    : "text-emerald-700"
                                            }`}
                                        >
                                            {fact.label}
                                        </p>
                                        {fact.badge ? (
                                            <span className="rounded-full border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                                                {fact.badge}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                                            <p className="text-[11px] font-medium text-slate-500">
                                                {comparisonLabels.caseOneLabel}
                                            </p>
                                            <p className="text-sm font-semibold text-slate-900">
                                                {fact.first}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-sky-50 px-3 py-2">
                                            <p className="text-[11px] font-medium text-sky-600">
                                                {comparisonLabels.caseTwoLabel}
                                            </p>
                                            <p className="text-sm font-semibold text-slate-900">
                                                {fact.second}
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                    <section className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm md:hidden">
                        <div className="space-y-3">
                            <article className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                                <button
                                    type="button"
                                    onClick={() => toggleMobileComparisonSection("quick")}
                                    aria-expanded={mobileComparisonSection === "quick"}
                                    className="flex w-full items-start justify-between gap-3 text-left"
                                >
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-900">
                                            {comparisonLabels.quickViewTitle}
                                        </h2>
                                        <p className="mt-1 text-sm text-gray-700">
                                            {comparisonLabels.mobileDrillDownHint}
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800">
                                        {mobileComparisonSection === "quick"
                                            ? comparisonLabels.mobileCollapse
                                            : comparisonLabels.mobileExpand}
                                    </span>
                                </button>
                                {mobileComparisonSection === "quick" ? (
                                    <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                                            {comparisonLabels.mobileDifferencesTitle}
                                        </p>
                                        <div className="mt-3 space-y-2">
                                            {mobileQuickFacts.map((fact) => (
                                                <div
                                                    key={fact.label}
                                                    className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2"
                                                >
                                                    <p className="text-xs font-semibold text-emerald-900">
                                                        {fact.label}
                                                    </p>
                                                    <p className="mt-1 text-xs text-gray-700">
                                                        {comparisonLabels.mobileFocusCaseOne}: {fact.first}
                                                    </p>
                                                    <p className="text-xs text-gray-700">
                                                        {comparisonLabels.mobileFocusCaseTwo}: {fact.second}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </article>
                            <article className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                                <button
                                    type="button"
                                    onClick={() => toggleMobileComparisonSection("focus")}
                                    aria-expanded={mobileComparisonSection === "focus"}
                                    className="flex w-full items-start justify-between gap-3 text-left"
                                >
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-900">
                                            {comparisonLabels.mobileFocusTitle}
                                        </h2>
                                        <p className="mt-1 text-sm text-gray-700">
                                            {comparisonLabels.mobileDrillDownHint}
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-sky-300 bg-white px-2 py-1 text-[11px] font-semibold text-sky-800">
                                        {mobileComparisonSection === "focus"
                                            ? comparisonLabels.mobileCollapse
                                            : comparisonLabels.mobileExpand}
                                    </span>
                                </button>
                                {mobileComparisonSection === "focus" ? (
                                    <div className="mt-4 space-y-3">
                                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-800">
                                                {comparisonLabels.mobileFocusCaseOne}
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-rose-900">
                                                {buildPrimaryAlert(comparisonPayloads.first).message}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-800">
                                                {comparisonLabels.mobileFocusCaseTwo}
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-rose-900">
                                                {buildPrimaryAlert(comparisonPayloads.second).message}
                                            </p>
                                        </div>
                                        <div className="rounded-lg border border-sky-100 bg-white p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                                                {comparisonLabels.microSummaryTitle}
                                            </p>
                                            <ul className="mt-3 space-y-2 text-sm text-gray-700">
                                                {buildMicroSummary(comparisonPayloads.first)
                                                    .slice(0, 2)
                                                    .map((item) => (
                                                        <li
                                                            key={`first-${item}`}
                                                            className="rounded-md bg-sky-50 px-3 py-2"
                                                        >
                                                            {comparisonLabels.mobileFocusCaseOne}: {item}
                                                        </li>
                                                    ))}
                                                {buildMicroSummary(comparisonPayloads.second)
                                                    .slice(0, 2)
                                                    .map((item) => (
                                                        <li
                                                            key={`second-${item}`}
                                                            className="rounded-md bg-sky-50 px-3 py-2"
                                                        >
                                                            {comparisonLabels.mobileFocusCaseTwo}: {item}
                                                        </li>
                                                    ))}
                                            </ul>
                                        </div>
                                    </div>
                                ) : null}
                            </article>
                        </div>
                    </section>
                    <section className="hidden rounded-xl border border-sky-200 bg-white p-5 shadow-sm md:block">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {comparisonLabels.generatedSummaryTitle}
                        </h2>
                        <p className="mt-1 text-sm text-gray-600">
                            {comparisonLabels.generatedSummaryHelp}
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <article className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {buildComparisonHeading(
                                        comparisonLabels.caseOneLabel,
                                        comparisonPayloads.first
                                    )}
                                </h3>
                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-full bg-rose-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                                            {buildPrimaryAlert(comparisonPayloads.first).icon}
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-800">
                                                {comparisonLabels.primaryAlertTitle}
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-rose-900">
                                                {buildPrimaryAlert(comparisonPayloads.first).message}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 rounded-lg border border-sky-100 bg-white p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                                        {comparisonLabels.microSummaryTitle}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {comparisonLabels.microSummaryHelp}
                                    </p>
                                    <ul className="mt-3 space-y-2 text-sm text-gray-700">
                                        {buildMicroSummary(comparisonPayloads.first).map((item) => (
                                            <li key={item} className="rounded-md bg-sky-50 px-3 py-2">
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">
                                    {comparisonResultOne?.patient_summary?.plain_language ||
                                        comparisonScenarioOne.questions?.[0]?.answer ||
                                        comparisonErrorOne ||
                                        comparisonLabels.summaryUnavailable}
                                </p>
                            </article>
                            <article className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {buildComparisonHeading(
                                        comparisonLabels.caseTwoLabel,
                                        comparisonPayloads.second
                                    )}
                                </h3>
                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-full bg-rose-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                                            {buildPrimaryAlert(comparisonPayloads.second).icon}
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-800">
                                                {comparisonLabels.primaryAlertTitle}
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-rose-900">
                                                {buildPrimaryAlert(comparisonPayloads.second).message}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 rounded-lg border border-sky-100 bg-white p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                                        {comparisonLabels.microSummaryTitle}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {comparisonLabels.microSummaryHelp}
                                    </p>
                                    <ul className="mt-3 space-y-2 text-sm text-gray-700">
                                        {buildMicroSummary(comparisonPayloads.second).map((item) => (
                                            <li key={item} className="rounded-md bg-sky-50 px-3 py-2">
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">
                                    {comparisonResultTwo?.patient_summary?.plain_language ||
                                        comparisonScenarioTwo.questions?.[0]?.answer ||
                                        comparisonErrorTwo ||
                                        comparisonLabels.summaryUnavailable}
                                </p>
                            </article>
                        </div>
                    </section>
                    {comparisonScenarioOne.relevanceByAgeChart &&
                        comparisonScenarioTwo.relevanceByAgeChart && (
                            <section className="hidden rounded-xl border border-sky-200 bg-white p-5 shadow-sm md:block">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    {comparisonLabels.relevanceChartTitle}
                                </h2>
                                <p className="mt-1 text-sm text-gray-600">
                                    {comparisonLabels.relevanceChartHelp}
                                </p>
                                <div className="mt-4 space-y-4">
                                    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                        <h3 className="mb-3 text-sm font-semibold text-gray-900">
                                            {buildComparisonHeading(
                                                comparisonLabels.caseOneLabel,
                                                comparisonPayloads.first
                                            )}
                                        </h3>
                                        <ClinicalRelevanceByAgeChart
                                            title={comparisonScenarioOne.relevanceByAgeChart.title}
                                            subtitle={comparisonScenarioOne.relevanceByAgeChart.subtitle}
                                            interpretationNote={
                                                comparisonScenarioOne.relevanceByAgeChart
                                                    .interpretationNote
                                            }
                                            ageBuckets={
                                                comparisonScenarioOne.relevanceByAgeChart.ageBuckets
                                            }
                                            levelLabels={
                                                comparisonScenarioOne.relevanceByAgeChart.levelLabels
                                            }
                                            series={comparisonScenarioOne.relevanceByAgeChart.series}
                                            sources={
                                                comparisonScenarioOne.relevanceByAgeChart.sources
                                            }
                                        />
                                    </article>
                                    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                        <h3 className="mb-3 text-sm font-semibold text-gray-900">
                                            {buildComparisonHeading(
                                                comparisonLabels.caseTwoLabel,
                                                comparisonPayloads.second
                                            )}
                                        </h3>
                                        <ClinicalRelevanceByAgeChart
                                            title={comparisonScenarioTwo.relevanceByAgeChart.title}
                                            subtitle={comparisonScenarioTwo.relevanceByAgeChart.subtitle}
                                            interpretationNote={
                                                comparisonScenarioTwo.relevanceByAgeChart
                                                    .interpretationNote
                                            }
                                            ageBuckets={
                                                comparisonScenarioTwo.relevanceByAgeChart.ageBuckets
                                            }
                                            levelLabels={
                                                comparisonScenarioTwo.relevanceByAgeChart.levelLabels
                                            }
                                            series={comparisonScenarioTwo.relevanceByAgeChart.series}
                                            sources={
                                                comparisonScenarioTwo.relevanceByAgeChart.sources
                                            }
                                        />
                                    </article>
                                </div>
                            </section>
                        )}
                </div>
            )}

            {activeTab === "clinical" && !loading && !comparisonLoading && !isComparisonMode && (
                <div className="space-y-4">
                    <div className="flex justify-start">
                        <button
                            type="button"
                            onClick={handleBackToClinicalDemo}
                            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                            {clinicalResultStrings.backToClinicalDemo} /clinical-demo
                        </button>
                    </div>
                    <ClinicalDemoResult
                        demoData={{
                            treatments:
                                Array.isArray(result?.treatments) && result.treatments.length > 0
                                    ? (result.treatments as any[])
                                    : demoScenario.treatments,
                            questions: demoScenario.questions,
                            summary: result?.patient_summary?.plain_language || undefined,
                            error: error || undefined,
                            errorCode: errorCode || undefined,
                            clinical_summary: result?.clinical_summary,
                            recommendations: result?.recommendations,
                            initial_evaluation_recommendations:
                                result?.initial_evaluation_recommendations,
                            treatment_options: result?.treatment_options,
                            follow_up_and_monitoring: result?.follow_up_and_monitoring,
                            other_ai_fields: result?.other_ai_fields,
                            relevanceByAgeChart: demoScenario.relevanceByAgeChart,
                        }}
                        sourceMode={serviceMode || undefined}
                        realAI={canConfigureAi && forceReal}
                        canReverify={user?.role === "SUPERADMIN"}
                        onReverify={handleReverifyAnalysis}
                        reverifyLoading={reverifyLoading}
                        canCopyRequest={Boolean(lastPayload)}
                        onCopyRequest={handleCopyClinicalRequest}
                        copyRequestFeedback={copyRequestFeedback}
                    />
                </div>
            )}
        </div>
    );
}
