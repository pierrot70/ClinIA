import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { HomeI18nProvider } from "./contexts/HomeI18nContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // <React.StrictMode>
    <BrowserRouter>
      <HomeI18nProvider>
        <App />
      </HomeI18nProvider>
    </BrowserRouter>
  // </React.StrictMode>
);
