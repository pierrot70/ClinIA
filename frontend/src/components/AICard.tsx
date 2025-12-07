import React from "react";

interface AICardProps {
    loading: boolean;
    error: boolean;
    text: string | null | undefined;
}

export default function AICard({ loading, error, text }: AICardProps) {
    if (loading) {
        return (
            <div className="p-6 bg-white border rounded-xl shadow-sm">
                <p className="text-gray-500 text-sm">Analyse IA en cours…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-white border rounded-xl shadow-sm">
                <p className="text-red-600 font-semibold">Erreur lors de l&apos;analyse IA</p>
            </div>
        );
    }

    const hasText = typeof text === "string" && text.trim().length > 0;

    return (
        <div className="p-6 bg-white border rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">🧍 Résumé pour le patient</h3>

            <p className="text-gray-700 leading-relaxed text-sm">
                {hasText ? text : "Aucun résumé reçu (réponse IA vide ou non conforme)."}
            </p>
        </div>
    );
}
