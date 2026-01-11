export function TreatmentCard({ treatment }: { treatment: any }) {
    return (
        <div className="bg-white border rounded p-5 space-y-3">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                    Traitement recommandé
                </h2>
                <span className="text-sm px-2 py-1 rounded bg-blue-100 text-blue-800">
          Niveau de preuve {treatment.evidence_level}
        </span>
            </div>

            <div>
                <div className="text-xl font-bold">{treatment.name}</div>
                <div className="text-sm text-gray-600">{treatment.indication}</div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="font-medium">Posologie :</span>{" "}
                    <span className="font-semibold">{treatment.dosage}</span>
                </div>
                <div>
                    <span className="font-medium">Durée :</span>{" "}
                    {treatment.duration}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <div className="font-medium mb-1">Contre-indications</div>
                    <ul className="list-disc list-inside text-gray-700">
                        {treatment.contraindications.map((ci: string, i: number) => (
                            <li key={i}>{ci}</li>
                        ))}
                    </ul>
                </div>

                <div>
                    <div className="font-medium mb-1">Surveillance</div>
                    <ul className="list-disc list-inside text-gray-700">
                        {treatment.monitoring.map((m: string, i: number) => (
                            <li key={i}>{m}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
