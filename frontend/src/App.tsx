import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";

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
import UserRegisterPage from "./pages/UserRegisterPage";
import {ClinicalAnalyzePage} from "./pages/ClinicalAnalyzePage";
import { AppointmentsPage } from "./pages/AppointmentsPage";
import { AppointmentsListPage } from "./pages/AppointmentsList";
import { PatientsPage } from "./pages/PatientsPage";
import { PatientAuditLogsPage } from "./pages/PatientAuditLogsPage";
import { OpenAILogsPage } from "./pages/OpenAILogsPage";
import { CliniquesPage } from "./pages/CliniquesPage";
import { SpecialistsPage } from "./pages/SpecialistsPage";

const CLINICAL_ROLES = ["USER", "MEDECIN", "ADMIN", "SUPERADMIN"] as const;
const ADMIN_ROLES = ["ADMIN", "SUPERADMIN"] as const;
const SUPERADMIN_ROLES = ["SUPERADMIN"] as const;
const API_URL = import.meta.env.VITE_API_URL as string;
const APP_STATUS_REFRESH_MS = 10_000;

function CoolifyLandingPage() {
    return (
        <section className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
            <div className="space-y-3 text-center">
                <h1 className="text-3xl font-semibold text-gray-900">
                    ClinIA
                </h1>
                <p className="mx-auto max-w-2xl text-sm text-gray-600">
                    Choisissez votre point d'entree. La demo clinique est accessible
                    sans connexion. Les acces medecin et admin utilisent les pages
                    de connexion dediees.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Link
                    to="/clinical-demo"
                    className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm transition hover:border-sky-300 hover:bg-sky-100"
                >
                    <div className="text-lg font-semibold text-sky-950">
                        Demo clinique
                    </div>
                    <p className="mt-2 text-sm text-sky-900">
                        Acceder directement a la demonstration ClinIA.
                    </p>
                </Link>

                <Link
                    to="/login"
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
                >
                    <div className="text-lg font-semibold text-gray-900">
                        Connexion medecin
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                        Ouvrir la page de connexion utilisateur.
                    </p>
                </Link>

                <Link
                    to="/admin/login"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-300 hover:bg-amber-100"
                >
                    <div className="text-lg font-semibold text-amber-950">
                        Connexion admin
                    </div>
                    <p className="mt-2 text-sm text-amber-900">
                        Ouvrir la page de connexion administrateur.
                    </p>
                </Link>
            </div>
        </section>
    );
}

const App: React.FC = () => {
    const { blockingIncident, setBlockingIncident } = useSecurityIncident();
    const [acknowledging, setAcknowledging] = useState(false);
    const showCoolifyLanding = !!import.meta.env.PROD;
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
        <div className="min-h-screen flex flex-col bg-background">
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
                    Maintenance en cours. L'application est temporairement arretee pour les usagers non SUPERADMIN.
                </div>
            )}
            <main className="flex-1">
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
                        path="/admin/users/manage"
                        element={
                            <ProtectedRoute allowedRoles={[...SUPERADMIN_ROLES]}>
                                <UserRegisterPage />
                            </ProtectedRoute>
                        }
                    />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
};

export default App;
