import React, { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

const suggestions = [
  "Hypertension essentielle grade 1",
  "Douleur neuropathique chronique",
  "Migraine avec aura",
  "Anxiété généralisée",
];

const SearchBar: React.FC = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = useCallback(() => {
    const q = query.trim() || suggestions[0];
    navigate(`/results?q=${encodeURIComponent(q)}`);
  }, [navigate, query]);

  useEffect(() => {
    const consumeBufferedDictation = () => {
      const buffered = (window as any).__cliniaLastDictation as
        | string
        | undefined;
      if (!buffered) {
        return;
      }
      (window as any).__cliniaLastDictation = "";
      setQuery((prev) => {
        const nextText = buffered.trim();
        if (!nextText) {
          return prev;
        }
        return prev ? `${prev} ${nextText}` : nextText;
      });
    };

    consumeBufferedDictation();

    const handleDictation = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) {
        return;
      }
      setQuery((prev) => {
        const nextText = detail.text.trim();
        if (!nextText) {
          return prev;
        }
        return prev ? `${prev} ${nextText}` : nextText;
      });
    };

    const handleExecute = () => {
      handleSearch();
    };

    const handleClear = () => {
      setQuery("");
    };

    window.addEventListener("clinia:voice-dictation", handleDictation);
    window.addEventListener("clinia:voice-execute", handleExecute);
    window.addEventListener("clinia:voice-clear", handleClear);

    return () => {
      window.removeEventListener("clinia:voice-dictation", handleDictation);
      window.removeEventListener("clinia:voice-execute", handleExecute);
      window.removeEventListener("clinia:voice-clear", handleClear);
    };
  }, [handleSearch]);

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div className="bg-white shadow-sm rounded-xl px-4 py-3 flex items-center gap-3 border border-gray-200">
        <Search className="text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Ex: Hypertension essentielle grade 1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 outline-none text-sm sm:text-base text-gray-800 placeholder:text-gray-400 bg-transparent"
        />
        <button
          onClick={handleSearch}
          className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Rechercher
        </button>
      </div>
      <div className="text-xs text-gray-500">
        Exemples : {suggestions.join(" • ")}
      </div>
    </div>
  );
};

export default SearchBar;
