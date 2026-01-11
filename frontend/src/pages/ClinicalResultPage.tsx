import type { ClinicalAnalysis } from "../types/clinical";

type Props = {
    data: ClinicalAnalysis;
    serviceMode: "real" | "mock" | "degraded" | null;
};

export function ClinicalResultPage({ data, serviceMode }: Props) {
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
            {serviceMode === "degraded" && (
                <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-4 text-sm">
                    <strong>Résultat généré en mode dégradé</strong>
                    <p className="mt-1">
                        Le service avancé est temporairement indisponible.
                        <br />
                        Nous travaillons activement à rétablir le service
                        (SLA <strong>99.999%</strong>).
                    </p>
                </div>
            )}

            <h2 className="text-xl font-semibold">Résultat clinique</h2>

            <section>
                <h3 className="font-medium">Diagnostic suspecté</h3>
                <p>{diagnosis?.suspected ?? "—"}</p>
                {diagnosis?.justification && (
                    <p className="text-sm text-gray-600">
                        {diagnosis.justification}
                    </p>
                )}
            </section>

            <section>
                <h3 className="font-medium">Résumé patient</h3>
                <p>
                    {patient_summary?.plain_language ??
                        "Aucun résumé patient disponible."}
                </p>
            </section>

            <section>
                <h3 className="font-medium">Traitements proposés</h3>
                {Array.isArray(treatments) && treatments.length > 0 ? (
                    <ul className="list-disc ml-5">
                        {treatments.map((t, i) => (
                            <li key={i}>{t?.name ?? "—"}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500">
                        Aucun traitement structuré disponible.
                    </p>
                )}
            </section>

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
