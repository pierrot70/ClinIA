import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { SecurityIncidentProvider } from "./contexts/SecurityIncidentContext";
import "./index.css";
import { HomeI18nProvider } from "./contexts/HomeI18nContext";
import { AuthProvider } from "./auth/AuthContext";
import { ClinicalAnalysisNavigationProvider } from "./contexts/ClinicalAnalysisNavigationContext";
import { ReceptionClinicProvider } from "./contexts/ReceptionClinicContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <HomeI18nProvider>
          <ClinicalAnalysisNavigationProvider>
            <ReceptionClinicProvider>
              <SecurityIncidentProvider>
                <App />
              </SecurityIncidentProvider>
            </ReceptionClinicProvider>
          </ClinicalAnalysisNavigationProvider>
        </HomeI18nProvider>
      </AuthProvider>
    </BrowserRouter>
  // </React.StrictMode>
);
