import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const [isWaitingDictation, setIsWaitingDictation] = useState(false);
  const navigate = useNavigate();
  const lastInsertRef = useRef<{ text: string; at: number } | null>(null);

  const handleSearch = useCallback(() => {
    const q = query.trim() || suggestions[0];
    navigate(`/results?q=${encodeURIComponent(q)}`);
  }, [navigate, query]);

  useEffect(() => {
    // Initialize waiting state from localStorage in case voice-start occurred
    // before this component mounted (e.g., navigation to home).
    try {
      const stored = window.localStorage.getItem("clinia_waiting_dictation");
      if (stored === "1") setIsWaitingDictation(true);
    } catch (e) {}
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const shouldInsert = (text: string) => {
      const normalized = normalize(text);
      if (!normalized) {
        return false;
      }
      const now = Date.now();
      const last = lastInsertRef.current;
      if (last && last.text === normalized && now - last.at < 2000) {
        return false;
      }
      lastInsertRef.current = { text: normalized, at: now };
      return true;
    };

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
        if (!nextText || !shouldInsert(nextText)) {
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
      // Received dictation -> re-enable search button and clear persisted flag
      try {
        window.localStorage.removeItem("clinia_waiting_dictation");
      } catch (e) {}
      setIsWaitingDictation(false);
      setQuery((prev) => {
        const nextText = detail.text.trim();
        if (!nextText || !shouldInsert(nextText)) {
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
      // Visual waiting state: show red border when cleared by voice
      setIsWaitingDictation(true);
    };

    window.addEventListener("clinia:voice-dictation", handleDictation);
    const handleVoiceStart = () => setIsWaitingDictation(true);
    window.addEventListener("clinia:voice-start", handleVoiceStart);
    window.addEventListener("clinia:voice-execute", handleExecute);
    window.addEventListener("clinia:voice-clear", handleClear);

    return () => {
      window.removeEventListener("clinia:voice-dictation", handleDictation);
      window.removeEventListener("clinia:voice-start", handleVoiceStart);
      window.removeEventListener("clinia:voice-execute", handleExecute);
      window.removeEventListener("clinia:voice-clear", handleClear);
    };
  }, [handleSearch]);

  const containerClass =
    "bg-white shadow-sm rounded-xl px-4 py-3 flex items-center gap-3 border " +
    (isWaitingDictation ? "border-red-500" : "border-black");

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div className={containerClass}>
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
          disabled={isWaitingDictation}
          className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          Lancer Requete
        </button>
      </div>
      <div className="text-xs text-gray-500">
        Exemples : {suggestions.join(" • ")}
      </div>
    </div>
  );
};

export default SearchBar;
