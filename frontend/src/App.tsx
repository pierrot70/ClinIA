import React from "react";
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

const CLINICAL_ROLES = ["MEDECIN", "ADMIN", "SUPERADMIN"] as const;
const ADMIN_ROLES = ["ADMIN", "SUPERADMIN"] as const;
const SUPERADMIN_ROLES = ["SUPERADMIN"] as const;

const App: React.FC = () => {
    return (
        <div className="min-h-screen flex flex-col bg-background">
            <Header />
            <main className="flex-1">
                <Routes>
                    <Route path="/" element={<Home />} />
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
