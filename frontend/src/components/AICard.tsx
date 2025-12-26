type Props = {
    loading: boolean;
    error: boolean;
    text?: string;
};

export default function AICard({ loading, error, text }: Props) {
    if (loading) {
        return (
            <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-600">
                Analyse en cours…
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
