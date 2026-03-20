import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { SecurityIncidentProvider } from "./contexts/SecurityIncidentContext";
import "./index.css";
import { HomeI18nProvider } from "./contexts/HomeI18nContext";
import { AuthProvider } from "./auth/AuthContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <HomeI18nProvider>
          <SecurityIncidentProvider>
            <App />
          </SecurityIncidentProvider>
        </HomeI18nProvider>
      </AuthProvider>
    </BrowserRouter>
  // </React.StrictMode>
);
