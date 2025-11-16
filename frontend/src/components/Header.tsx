import React from "react";
import { Stethoscope } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const Header: React.FC = () => {
  const location = useLocation();

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
              <img
                  src="/logo.png"
                  alt="ClinIA logo"
                  className="h-10 w-auto"
              />
              <div>
                  <div className="font-semibold text-lg leading-tight">ClinIA</div>
                  <div className="text-xs text-gray-500">
                      Assistant clinique IA – Prototype
                  </div>
              </div>
          </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link
            to="/"
            className={
              "hover:text-primary transition-colors " +
              (location.pathname === "/" ? "text-primary font-medium" : "text-gray-600")
            }
          >
            Accueil
          </Link>
          <Link
            to="/quick"
            className={
              "hover:text-primary transition-colors " +
              (location.pathname === "/quick" ? "text-primary font-medium" : "text-gray-600")
            }
          >
            Mode rapide
          </Link>
          <Link
            to="/patient-summary"
            className={
              "hover:text-primary transition-colors " +
              (location.pathname === "/patient-summary" ? "text-primary font-medium" : "text-gray-600")
            }
          >
            Résumé patient
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
