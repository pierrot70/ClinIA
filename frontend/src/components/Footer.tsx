import React from "react";

const Footer: React.FC = () => {
  const appVersion =
    import.meta.env.VITE_APP_VERSION ?? "0.0.0";
  const buildTime =
    import.meta.env.VITE_BUILD_TIME ?? "unknown";

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-gray-500 flex flex-col sm:flex-row gap-1 sm:gap-4 justify-between">
        <span>© 2025 ClinIA – Prototype non destiné à l&apos;usage clinique réel.</span>
        <span>Conçu pour démonstration avec données simulées.</span>
        <span>Version {appVersion} • Build {buildTime}</span>
      </div>
    </footer>
  );
};

export default Footer;
