import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import Results from "./pages/Results";
import TreatmentDetails from "./pages/TreatmentDetails";
import QuickMode from "./pages/QuickMode";
import PatientSummary from "./pages/PatientSummary";
import Header from "./components/Header";
import Footer from "./components/Footer";

import MockStudio from "./pages/MockStudio";
// 🆕 Import obligatoire pour que le bouton Admin fonctionne
import AdminLogin from "./pages/AdminLogin";
import {ClinicalAnalyzePage} from "./pages/ClinicalAnalyzePage";
import { AppointmentsPage } from "./pages/AppointmentsPage";
import { AppointmentsListPage } from "./pages/AppointmentsList";
import { PatientsPage } from "./pages/PatientsPage";
import { CliniquesPage } from "./pages/CliniquesPage";
import { SpecialistsPage } from "./pages/SpecialistsPage";

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

                    {/* 🧠 ClinIA – Analyse clinique et appointments */}
                    <Route path="/clinical" element={<ClinicalAnalyzePage />} />
                    <Route path="/appointments" element={<AppointmentsPage />} />
                    <Route path="/appointments/list" element={<AppointmentsListPage />} />
                    <Route path="/patients" element={<PatientsPage />} />
                    <Route path="/cliniques" element={<CliniquesPage />} />
                    <Route path="/specialists" element={<SpecialistsPage />} />

                    {/* 🆕 Admin */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/mock-studio" element={<MockStudio />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
};

export default App;
