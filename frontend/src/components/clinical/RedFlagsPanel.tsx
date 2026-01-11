export function RedFlagsPanel({ flags }: { flags: string[] }) {
    return (
        <div className="bg-red-50 border border-red-200 rounded p-4">
            <div className="font-semibold text-red-800 mb-2">
                ⚠️ Signaux d’alerte
            </div>
            <ul className="list-disc list-inside text-sm text-red-700">
                {flags.map((flag, i) => (
                    <li key={i}>{flag}</li>
                ))}
            </ul>
        </div>
    );
}
