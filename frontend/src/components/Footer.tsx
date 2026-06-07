import React, { useContext } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { getFooterStrings } from "../i18n/footerStrings";

const Footer: React.FC = () => {
  const i18n = useContext(HomeI18nContext) || { locale: "fr-CA" };
  const footerStrings = getFooterStrings(i18n.locale);
  const appVersion =
    import.meta.env.VITE_APP_VERSION ?? "0.0.0";
  const buildTime =
    import.meta.env.VITE_BUILD_TIME ?? "unknown";

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-gray-500 flex flex-col sm:flex-row gap-1 sm:gap-4 justify-between">
        <span>{footerStrings.prototypeNotice}</span>
        <span>{footerStrings.simulatedDataNotice}</span>
        <span>{footerStrings.builtWithChatGPT}</span>
        <span>{footerStrings.versionPrefix} {appVersion} • {footerStrings.buildPrefix} {buildTime}</span>
      </div>
    </footer>
  );
};

export default Footer;
