import React from "react";

export interface Treatment {
    name: string;
    justification: string;
    contraindications: string[] | string;
    efficacy: number;
}

interface AITreatmentTableProps {
    treatments: Treatment[];
}

const AITreatmentTable: React.FC<AITreatmentTableProps> = ({ treatments }) => {
    return (
        <div className="p-6 bg-white shadow-lg rounded-xl border border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-blue-700">
                Options thérapeutiques proposées
            </h2>

            <table className="w-full border-collapse text-sm">
                <thead>
                <tr className="bg-gray-100">
                    <th className="p-3 border">Traitement</th>
                    <th className="p-3 border">Justification</th>
                    <th className="p-3 border">Contre-indications</th>
                    <th className="p-3 border">Efficacité</th>
                </tr>
                </thead>

                <tbody>
                {treatments.map((t, i) => (
                    <tr key={i} className="border">
                        <td className="p-3 border font-semibold">{t.name}</td>
                        <td className="p-3 border">{t.justification}</td>
                        <td className="p-3 border text-red-600">
                            {Array.isArray(t.contraindications)
                                ? t.contraindications.join(", ")
                                : t.contraindications}
                        </td>
                        <td className="p-3 border">{t.efficacy}%</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
};

export default AITreatmentTable;
