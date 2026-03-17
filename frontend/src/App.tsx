import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import Results from "./pages/Results";
import TreatmentDetails from "./pages/TreatmentDetails";
import QuickMode from "./pages/QuickMode";
import PatientSummary from "./pages/PatientSummary";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";

import MockStudio from "./pages/MockStudio";
// 🆕 Import obligatoire pour que le bouton Admin fonctionne
import AdminLogin from "./pages/AdminLogin";
import LoginPage from "./pages/LoginPage";
import UserRegisterPage from "./pages/UserRegisterPage";
import {ClinicalAnalyzePage} from "./pages/ClinicalAnalyzePage";
import { AppointmentsPage } from "./pages/AppointmentsPage";
import { AppointmentsListPage } from "./pages/AppointmentsList";
import { PatientsPage } from "./pages/PatientsPage";
import { CliniquesPage } from "./pages/CliniquesPage";
import { SpecialistsPage } from "./pages/SpecialistsPage";
import { useAuth } from "./hooks/useAuth";

const CLINICAL_ROLES = ["USER", "MEDECIN", "ADMIN", "SUPERADMIN"] as const;
const ADMIN_ROLES = ["ADMIN", "SUPERADMIN"] as const;
const SUPERADMIN_ROLES = ["SUPERADMIN"] as const;
const API_URL = import.meta.env.VITE_API_URL as string;
const APP_STATUS_REFRESH_MS = 10_000;

const App: React.FC = () => {
    const { status, isAuthenticated } = useAuth();
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

    const homeEntry =
        status === "loading" ? (
            <div className="max-w-6xl mx-auto px-4 py-8">
                <p className="text-sm text-gray-500">Validation de session...</p>
            </div>
        ) : isAuthenticated ? (
            <Home />
        ) : (
            <Navigate to="/login" replace />
        );

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <Header />
            {maintenanceActive && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
                    Maintenance en cours. L'application est temporairement arretee pour les usagers non SUPERADMIN.
                </div>
            )}
            <main className="flex-1">
                <Routes>
                    <Route path="/" element={homeEntry} />
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
