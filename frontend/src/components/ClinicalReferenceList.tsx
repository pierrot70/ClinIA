import React, { useState } from "react";

type ClinicalReference = {
  label: string;
  url: string;
};

interface ClinicalReferenceListProps {
  sources: ClinicalReference[];
  title: string;
  hint?: string;
  language?: "fr" | "en";
}

const ClinicalReferenceList: React.FC<ClinicalReferenceListProps> = ({
  sources,
  title,
  hint,
  language = "fr",
}) => {
  const english = language === "en";
  const [activeSource, setActiveSource] = useState<ClinicalReference | null>(null);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <h3 className="text-xs font-semibold text-gray-800">{title}</h3>
        {hint ? <p className="mt-1 text-[11px] text-gray-500">{hint}</p> : null}
        <ul className="mt-2 space-y-1 text-[11px] text-gray-600">
          {sources.map((source) => (
            <li key={source.url}>
              <button
                type="button"
                onClick={() => setActiveSource(source)}
                className="text-left text-primary hover:underline"
              >
                {source.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {activeSource ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-gray-900">
                  {activeSource.label}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {english
                    ? "Close this window to return immediately to ClinIA."
                    : "Fermez cette fenetre pour revenir immediatement a ClinIA."}
                </p>
              </div>
              <div className="ml-4 flex items-center gap-2">
                <a
                  href={activeSource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 transition hover:bg-sky-100"
                >
                  {english ? "Open in a new tab" : "Ouvrir dans un nouvel onglet"}
                </a>
                <button
                  type="button"
                  onClick={() => setActiveSource(null)}
                  className="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  {english ? "Close" : "Fermer"}
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100">
              <iframe
                key={activeSource.url}
                src={activeSource.url}
                title={activeSource.label}
                className="h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ClinicalReferenceList;
