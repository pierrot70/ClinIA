type ClinicalPayload = any;

type StoredPatient = {
    id: string;
    label: string;
    payload: ClinicalPayload;
    lastUsedAt: number;
};

const HISTORY_KEY = "clinia_patient_history";

function loadHistory(): StoredPatient[] {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
        return [];
    }
}

function saveHistory(list: StoredPatient[]) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function savePatientToHistory(payload: ClinicalPayload) {
    const history = loadHistory();

    const label = `${payload.sex === "male" ? "Homme" : "Femme"} ${
        payload.age
    } ans`;

    const entry: StoredPatient = {
        id: crypto.randomUUID(),
        label,
        payload,
        lastUsedAt: Date.now(),
    };

    saveHistory([entry, ...history].slice(0, 10)); // max 10 patients
}

export function PatientHistory({
                                   onSelect,
                               }: {
    onSelect: (payload: ClinicalPayload) => void;
}) {
    const patients = loadHistory();

    if (patients.length === 0) return null;

    function remove(id: string) {
        saveHistory(patients.filter((p) => p.id !== id));
        location.reload();
    }

    return (
        <div className="bg-gray-50 border rounded p-4 space-y-2">
            <h3 className="font-semibold text-sm">Patients récents</h3>

            {patients.map((p) => (
                <div
                    key={p.id}
                    className="flex justify-between items-center bg-white border rounded px-3 py-2"
                >
                    <button
                        className="text-blue-600 hover:underline text-left"
                        onClick={() => onSelect(p.payload)}
                    >
                        {p.label}
                    </button>

                    <button
                        onClick={() => remove(p.id)}
                        className="text-xs text-gray-400 hover:text-red-500"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
