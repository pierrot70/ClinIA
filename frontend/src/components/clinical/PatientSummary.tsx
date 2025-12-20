import { useState } from "react";

export function PatientSummary({ summary }: { summary: any }) {
    const [mode, setMode] = useState<"plain" | "clinical">("plain");

    return (
        <div className="bg-white border rounded p-5">
            <div className="flex gap-2 mb-3">
                <button
                    className={`px-3 py-1 text-sm rounded ${
                        mode === "plain"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 text-gray-800"
                    }`}
                    onClick={() => setMode("plain")}
                >
                    Patient
                </button>
                <button
                    className={`px-3 py-1 text-sm rounded ${
                        mode === "clinical"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 text-gray-800"
                    }`}
                    onClick={() => setMode("clinical")}
                >
                    Clinique
                </button>
            </div>

            <p className="text-sm text-gray-700">
                {mode === "plain"
                    ? summary.plain_language
                    : summary.clinical_language}
            </p>
        </div>
    );
}
