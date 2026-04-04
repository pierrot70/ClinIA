type Props = {
    loading: boolean;
    error: boolean;
    text?: string;
};

export default function AICard({ loading, error, text }: Props) {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-lime-200 bg-lime-50/80 p-8 text-center">
                <div className="clinia-neon-loader" aria-hidden="true" />
                <div className="clinia-neon-text text-sm font-semibold uppercase tracking-[0.2em]">
                    Analyse en cours...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                {text || "Une erreur est survenue lors de l’analyse."}
            </div>
        );
    }

    if (!text) {
        return null;
    }

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-800">
            {text}
        </div>
    );
}
