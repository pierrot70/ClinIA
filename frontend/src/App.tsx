import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import Results from "./pages/Results";
import TreatmentDetails from "./pages/TreatmentDetails";
import QuickMode from "./pages/QuickMode";
import PatientSummary from "./pages/PatientSummary";
import Header from "./components/Header";
import Footer from "./components/Footer";

// 🆕 Import de la page Mock Studio
import MockStudio from "./pages/MockStudio";

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

                    {/* 🆕 Route Mock Studio */}
                    <Route path="/mock-studio" element={<MockStudio />} />

                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
};

export default App;
