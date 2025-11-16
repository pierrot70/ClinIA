import React from "react";

interface Row {
    name: string;
    justification: string;
    contraindications: string;
}

interface Props {
    rows: Row[];
}

const AITreatmentTable: React.FC<Props> = ({ rows }) => {
    if (!rows.length) return null;

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
                🧬 Tableau clinique généré automatiquement
            </h3>

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-gray-300 rounded-lg">
                    <thead className="bg-gray-100 text-gray-700">
                    <tr>
                        <th className="p-2 border">Traitement</th>
                        <th className="p-2 border">Justification</th>
                        <th className="p-2 border">Contre-indications</th>
                    </tr>
                    </thead>

                    <tbody>
                    {rows.map((row, idx) => (
                        <tr key={idx} className="odd:bg-white even:bg-gray-50">
                            <td className="p-2 border align-top font-medium text-gray-900">
                                {row.name}
                            </td>
                            <td className="p-2 border align-top text-gray-800 whitespace-pre-wrap">
                                {row.justification}
                            </td>
                            <td className="p-2 border align-top text-gray-800 whitespace-pre-wrap">
                                {row.contraindications}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AITreatmentTable;
