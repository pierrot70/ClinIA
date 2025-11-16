import React from "react";

interface AICardProps {
    loading: boolean;
    error: boolean;
    text: string | null;
}

const AICard: React.FC<AICardProps> = ({ loading, error, text }) => {
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">

            <h2 className="text-sm font-semibold text-gray-800">
                Analyse clinique assistée par IA
            </h2>

            {loading && (
                <p className="text-xs text-gray-500 animate-pulse">
                    Analyse en cours… merci de patienter.
                </p>
            )}

            {error && (
                <p className="text-xs text-red-500">
                    Une erreur est survenue. Impossible d’obtenir l’analyse IA.
                </p>
            )}

            {text && (
                <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {text}
                </div>
            )}
        </div>
    );
};

export default AICard;
