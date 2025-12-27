import type { ClinicalAnalysis } from "../types/clinical";

type Props = {
    data: ClinicalAnalysis | null;
};

export function ClinicalResultPage({ data }: Props) {
    // 🛡️ Sécurité ultime : rien à afficher
    if (!data) {
        return (
            <div className="p-6 text-gray-500">
                Aucune analyse disponible.
            </div>
        );
    }

    const {
        diagnosis,
        patient_summary,
        treatments,
        alternatives,
        red_flags,
        meta,
    } = data;

    return (
        <div className="bg-white p-6 rounded border space-y-6">
            <h2 className="text-xl font-semibold">Résultat clinique</h2>

            {/* ================= Diagnostic ================= */}
            <section className="space-y-1">
                <h3 className="font-medium">Diagnostic suspecté</h3>
                <p>{diagnosis?.suspected ?? "—"}</p>
                {diagnosis?.justification && (
                    <p className="text-sm text-gray-600">
                        {diagnosis.justification}
                    </p>
                )}
            </section>

            {/* ================= Résumé patient ================= */}
            <section className="space-y-1">
                <h3 className="font-medium">Résumé patient</h3>
                <p>
                    {patient_summary?.plain_language ??
                        "Aucun résumé patient disponible."}
                </p>
            </section>

            {/* ================= Traitements ================= */}
            <section className="space-y-2">
                <h3 className="font-medium">Traitements proposés</h3>

                {Array.isArray(treatments) && treatments.length > 0 ? (
                    <ul className="list-disc ml-5 space-y-1">
                        {treatments.map((t, i) => (
                            <li key={i}>
                                {t?.name ?? "Traitement non spécifié"}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500">
                        Aucun traitement structuré disponible.
                    </p>
                )}
            </section>

            {/* ================= Alternatives ================= */}
            {Array.isArray(alternatives) && alternatives.length > 0 && (
                <section className="space-y-2">
                    <h3 className="font-medium">Alternatives</h3>
                    <ul className="list-disc ml-5 space-y-1">
                        {alternatives.map((a, i) => (
                            <li key={i}>
                                {a?.name ?? "Alternative non spécifiée"}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* ================= Signaux d’alerte ================= */}
            {Array.isArray(red_flags) && red_flags.length > 0 && (
                <section className="space-y-2">
                    <h3 className="font-medium text-red-700">
                        Signaux d’alerte
                    </h3>
                    <ul className="list-disc ml-5 text-red-700 space-y-1">
                        {red_flags.map((r, i) => (
                            <li key={i}>{r}</li>
                        ))}
                    </ul>
                </section>
            )}

            {/* ================= Meta ================= */}
            <section className="text-xs text-gray-500 pt-4 border-t">
                <div>Modèle : {meta?.model ?? "—"}</div>
                <div>
                    Confiance :{" "}
                    {typeof meta?.confidence_score === "number"
                        ? Math.round(meta.confidence_score * 100) + "%"
                        : "—"}
                </div>
            </section>
        </div>
    );
}
