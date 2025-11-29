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
