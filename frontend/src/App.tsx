import React, { useContext, useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";

import DemoPage from "./pages/DemoPage";
import Results from "./pages/Results";
import TreatmentDetails from "./pages/TreatmentDetails";
import QuickMode from "./pages/QuickMode";
import PatientSummary from "./pages/PatientSummary";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import { SecurityBlockingAlert } from "./components/system/SecurityBlockingAlert";
import { useSecurityIncident } from "./contexts/SecurityIncidentContext";
import { acknowledgeSecurityIncident, REQUIRED_ACK_ACTION } from "./services/securityIncidentApi";

import MockStudio from "./pages/MockStudio";
// 🆕 Import obligatoire pour que le bouton Admin fonctionne
import AdminLogin from "./pages/AdminLogin";
import LoginPage from "./pages/LoginPage";
import ChangePasswordRequiredPage from "./pages/ChangePasswordRequiredPage";
import PasswordResetRequiredPage from "./pages/PasswordResetRequiredPage";
import UserRegisterPage from "./pages/UserRegisterPage";
import {ClinicalAnalyzePage} from "./pages/ClinicalAnalyzePage";
import { AppointmentsPage } from "./pages/AppointmentsPage";
import { AppointmentsListPage } from "./pages/AppointmentsList";
import { PatientsPage } from "./pages/PatientsPage";
import { PatientAuditLogsPage } from "./pages/PatientAuditLogsPage";
import { OpenAILogsPage } from "./pages/OpenAILogsPage";
import { DbStatusPage } from "./pages/DbStatusPage";
import { WriteOperationAuditsPage } from "./pages/WriteOperationAuditsPage";
import { CoordinationRequestsPage } from "./pages/CoordinationRequestsPage";
import { ClinicalSupportAccessInboxPage } from "./pages/ClinicalSupportAccessInboxPage";
import { DelegatedPatientAccessPage } from "./pages/DelegatedPatientAccessPage";
import { ClinicalSupportAccessRequestPage } from "./pages/ClinicalSupportAccessRequestPage";
import { MyWriteReceiptsPage } from "./pages/MyWriteReceiptsPage";
import { CliniquesPage } from "./pages/CliniquesPage";
import { SpecialistsPage } from "./pages/SpecialistsPage";
import { ClinicianCommentsPage } from "./pages/ClinicianCommentsPage";
import { labels } from "./i18n/uiLabels";
import { HomeI18nContext } from "./contexts/HomeI18nContext";
import { useTranslation } from "./hooks/useTranslation";
import { API_URL } from "./services/config";

const CLINICAL_ROLES = ["USER", "MEDECIN", "ADMIN", "SUPERADMIN"] as const;
const ADMIN_ROLES = ["ADMIN", "SUPERADMIN"] as const;
const SUPERADMIN_ROLES = ["SUPERADMIN"] as const;
const APP_STATUS_REFRESH_MS = 10_000;
const HOME_DEMO_TIP_STORAGE_KEY = "clinia_home_demo_tip_seen";
const HOME_DEMO_TIP_EVENT = "clinia:show-demo-tooltip";

function DevRouteIndicator() {
    const location = useLocation();

    if (!import.meta.env.DEV) {
        return null;
    }

    return (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-1.5">
            <div className="mx-auto max-w-6xl font-mono text-xs text-gray-500">
                {location.pathname}
            </div>
        </div>
    );
}

function CoolifyLandingPage() {
    const landingLabels = labels.app.landing;
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const { translated: title } = useTranslation({ text: landingLabels.title, targetLang, translationKey: "app.landing.title" });
    const { translated: subtitle } = useTranslation({ text: landingLabels.subtitle, targetLang, translationKey: "app.landing.subtitle" });
    const { translated: supportingText } = useTranslation({ text: landingLabels.supportingText, targetLang, translationKey: "app.landing.supportingText" });
    const { translated: clinicalDemoTitle } = useTranslation({ text: landingLabels.clinicalDemoTitle, targetLang, translationKey: "app.landing.clinicalDemoTitle" });
    const { translated: clinicalDemoBody } = useTranslation({ text: landingLabels.clinicalDemoBody, targetLang, translationKey: "app.landing.clinicalDemoBody" });
    const { translated: doctorLoginTitle } = useTranslation({ text: landingLabels.doctorLoginTitle, targetLang, translationKey: "app.landing.doctorLoginTitle" });
    const { translated: doctorLoginBody } = useTranslation({ text: landingLabels.doctorLoginBody, targetLang, translationKey: "app.landing.doctorLoginBody" });
    const { translated: adminLoginTitle } = useTranslation({ text: landingLabels.adminLoginTitle, targetLang, translationKey: "app.landing.adminLoginTitle" });
    const { translated: adminLoginBody } = useTranslation({ text: landingLabels.adminLoginBody, targetLang, translationKey: "app.landing.adminLoginBody" });
    const { translated: demoTooltip } = useTranslation({ text: landingLabels.demoTooltip, targetLang, translationKey: "app.landing.demoTooltip" });
    const { translated: tooltipOk } = useTranslation({ text: landingLabels.tooltipOk, targetLang, translationKey: "app.landing.tooltipOk" });
    const [showDemoTooltip, setShowDemoTooltip] = useState(false);

    const dismissDemoTooltip = () => {
        try {
            window.sessionStorage.setItem(HOME_DEMO_TIP_STORAGE_KEY, "true");
        } catch {}
        setShowDemoTooltip(false);
    };

    useEffect(() => {
        const handleShowDemoTooltip = () => {
            let alreadySeen = false;
            try {
                alreadySeen = window.sessionStorage.getItem(HOME_DEMO_TIP_STORAGE_KEY) === "true";
            } catch {}

            if (!alreadySeen) {
                setShowDemoTooltip(true);
            }
        };

        window.addEventListener(HOME_DEMO_TIP_EVENT, handleShowDemoTooltip);
        return () => {
            window.removeEventListener(HOME_DEMO_TIP_EVENT, handleShowDemoTooltip);
        };
    }, []);

    useEffect(() => {
        if (!showDemoTooltip) {
            return;
        }

        const timerId = window.setTimeout(() => {
            dismissDemoTooltip();
        }, 3_000);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [showDemoTooltip]);

    return (
        <section className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
            <div className="space-y-3 text-center">
                <h1 className="text-3xl font-semibold text-gray-900">
                    {title}
                </h1>
                <p className="mx-auto max-w-2xl text-sm text-gray-600">
                    {subtitle}
                </p>
                <p className="mx-auto max-w-3xl text-sm text-gray-500">
                    {supportingText}
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="relative">
                    {showDemoTooltip && (
                        <div className="absolute bottom-full left-1/2 z-[100] mb-3 w-72 -translate-x-1/2 rounded-xl border border-cyan-500 bg-cyan-50 p-4 text-sm text-cyan-950 shadow-2xl">
                            <div className="mb-2 text-base font-semibold">
                                {clinicalDemoTitle}
                            </div>
                            <p>{demoTooltip}</p>
                            <button
                                type="button"
                                onClick={dismissDemoTooltip}
                                className="mt-3 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                            >
                                {tooltipOk}
                            </button>
                            <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-cyan-500 bg-cyan-50" aria-hidden="true" />
                        </div>
                    )}
                    <Link
                        to="/clinical-demo"
                        className={
                            "block rounded-xl border bg-sky-50 p-5 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 " +
                            (showDemoTooltip
                                ? "border-emerald-500 ring-2 ring-emerald-200"
                                : "border-sky-200")
                        }
                    >
                        <div className="text-lg font-semibold text-sky-950">
                            {clinicalDemoTitle}
                        </div>
                        <p className="mt-2 text-sm text-sky-900">
                            {clinicalDemoBody}
                        </p>
                    </Link>
                </div>

                <Link
                    to="/login"
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
                >
                    <div className="text-lg font-semibold text-gray-900">
                        {doctorLoginTitle}
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                        {doctorLoginBody}
                    </p>
                </Link>

                <Link
                    to="/admin/login"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-300 hover:bg-amber-100"
                >
                    <div className="text-lg font-semibold text-amber-950">
                        {adminLoginTitle}
                    </div>
                    <p className="mt-2 text-sm text-amber-900">
                        {adminLoginBody}
                    </p>
                </Link>
            </div>
        </section>
    );
}

const App: React.FC = () => {
    const i18n = useContext(HomeI18nContext) || { locale: "fr" };
    const targetLang = i18n.locale;
    const { blockingIncident, setBlockingIncident } = useSecurityIncident();
    const [acknowledging, setAcknowledging] = useState(false);
    const showCoolifyLanding = !!import.meta.env.PROD;
    const { translated: maintenanceLabel } = useTranslation({
        text: labels.app.status.maintenance,
        targetLang,
        translationKey: "app.status.maintenance",
    });
        // Handler for acknowledgment
        const handleAcknowledge = async () => {
            if (!blockingIncident) return;
            setAcknowledging(true);
            try {
                await acknowledgeSecurityIncident({
                    incidentId: blockingIncident.incident.id,
                    action: REQUIRED_ACK_ACTION,
                    context: {},
                });
                setBlockingIncident(null);
            } finally {
                setAcknowledging(false);
            }
        };
    const [maintenanceActive, setMaintenanceActive] = useState(false);

    useEffect(() => {
        let mounted = true;

        const loadAppStatus = async () => {
            try {
                const response = await fetch(`${API_URL}/api/auth/app-status`);
                const payload = await response.json().catch(() => ({}));

                if (!mounted) {
                    return;
                }

                setMaintenanceActive(Boolean(payload?.data?.maintenanceActive));
            } catch {
                if (mounted) {
                    setMaintenanceActive(false);
                }
            }
        };

        void loadAppStatus();
        const intervalId = window.setInterval(() => {
            void loadAppStatus();
        }, APP_STATUS_REFRESH_MS);

        return () => {
            mounted = false;
            window.clearInterval(intervalId);
        };
    }, []);

    return (
        <div className="fixed inset-0 isolate flex h-[100dvh] flex-col overflow-hidden bg-background lg:static lg:min-h-screen lg:h-auto lg:overflow-visible">
            <Header />
            {blockingIncident && (
                <SecurityBlockingAlert
                    blocking={blockingIncident}
                    actionableMessage={REQUIRED_ACK_ACTION}
                    acknowledging={acknowledging}
                    onAcknowledge={handleAcknowledge}
                />
            )}
            {maintenanceActive && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
                    {maintenanceLabel}
                </div>
            )}
            <DevRouteIndicator />
            <main className="relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(5rem+env(safe-area-inset-bottom)+var(--clinia-mobile-browser-inset,0px))] lg:overflow-visible lg:pb-0">
                <Routes>
                    <Route
                        path="/"
                        element={
                            showCoolifyLanding ? (
                                <CoolifyLandingPage />
                            ) : (
                                <Navigate to="/clinical-demo" replace />
                            )
                        }
                    />
                    <Route path="/demo" element={<DemoPage />} />
                    <Route path="/results" element={<Results />} />
                    <Route path="/treatment/:id" element={<TreatmentDetails />} />
                    <Route path="/quick" element={<QuickMode />} />
                    <Route path="/patient-summary" element={<PatientSummary />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/security/change-password-required" element={<ChangePasswordRequiredPage />} />
                    <Route path="/security/password-reset-required" element={<PasswordResetRequiredPage />} />

                    {/* 🧠 ClinIA – Analyse clinique et appointments */}
                    <Route
                        path="/clinical"
                        element={
                            <ProtectedRoute allowedRoles={[...CLINICAL_ROLES]}>
                                <ClinicalAnalyzePage />
                            </ProtectedRoute>
                        }
                    />
                    {/* Route spéciale démo : accès direct sans auth */}
                    <Route path="/clinical-demo" element={<ClinicalAnalyzePage />} />
                    <Route
                        path="/appointments"
                        element={
                            <ProtectedRoute allowedRoles={[...CLINICAL_ROLES]}>
                                <AppointmentsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/appointments/list"
                        element={
                            <ProtectedRoute allowedRoles={[...CLINICAL_ROLES]}>
                                <AppointmentsListPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/patients"
                        element={
                            <ProtectedRoute allowedRoles={[...CLINICAL_ROLES]}>
                                <PatientsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical-support-access/inbox"
                        element={
                            <ProtectedRoute allowedRoles={["MEDECIN"]}>
                                <ClinicalSupportAccessInboxPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical-support-access/patients"
                        element={
                            <ProtectedRoute allowedRoles={["SUPERADMIN"]}>
                                <DelegatedPatientAccessPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/clinical-support-access/request"
                        element={
                            <ProtectedRoute allowedRoles={["SUPERADMIN"]}>
                                <ClinicalSupportAccessRequestPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/comments"
                        element={<ClinicianCommentsPage />}
                    />
                    <Route
                        path="/cliniques"
                        element={
                            <ProtectedRoute allowedRoles={[...CLINICAL_ROLES]}>
                                <CliniquesPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/specialists"
                        element={
                            <ProtectedRoute allowedRoles={[...CLINICAL_ROLES]}>
                                <SpecialistsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/my-write-receipts"
                        element={
                            <ProtectedRoute allowedRoles={[...CLINICAL_ROLES]}>
                                <MyWriteReceiptsPage />
                            </ProtectedRoute>
                        }
                    />

                    {/* 🆕 Admin */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route
                        path="/mock-studio"
                        element={
                            <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
                                <MockStudio />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/patient-audits"
                        element={
                            <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
                                <PatientAuditLogsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/openai-logs"
                        element={
                            <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
                                <OpenAILogsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/write-operation-audits"
                        element={
                            <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
                                <WriteOperationAuditsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/coordination-requests"
                        element={
                            <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
                                <CoordinationRequestsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/db-status"
                        element={
                            <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
                                <DbStatusPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/users/manage"
                        element={
                            <ProtectedRoute allowedRoles={[...SUPERADMIN_ROLES]}>
                                <UserRegisterPage />
                            </ProtectedRoute>
                        }
                    />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <div className="lg:hidden">
                    <Footer />
                </div>
            </main>
            <div className="hidden lg:block">
                <Footer />
            </div>
        </div>
    );
};

export default App;
