import { useState } from "react";

export function AlternativesPanel({ alternatives }: { alternatives: any[] }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="bg-white border rounded">
            <button
                onClick={() => setOpen(!open)}
                className="w-full text-left p-4 font-medium text-sm"
            >
                {open ? "Masquer les alternatives" : "Voir les alternatives"}
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-2 text-sm">
                    {alternatives.map((alt, i) => (
                        <div key={i}>
                            <span className="font-medium">{alt.name}</span> —{" "}
                            <span className="text-gray-600">{alt.reason}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
