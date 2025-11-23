// frontend/src/pages/MockStudio.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type Treatment = {
    name: string;
    justification: string;
    contraindications: string[];
    efficacy: number;
};

type MockEntry = {
    match: string[];
    patient_summary: string;
    treatments: Treatment[];
};

type MockMap = Record<string, MockEntry>;

const MockStudio: React.FC = () => {
    const [mocks, setMocks] = useState<MockMap>({});
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const navigate = useNavigate();

    // ------------------------------------------
    // 🔐 Charger les mocks AVEC VÉRIFICATION JWT
    // ------------------------------------------
    useEffect(() => {
        const fetchMocks = async () => {
            const token = localStorage.getItem("clinia_admin_token");

            if (!token) {
                navigate("/admin-login");
                return;
            }

            try {
                const res = await fetch(`${API_URL}/api/mocks`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem("clinia_admin_token");
                    navigate("/admin-login");
                    return;
                }

                const json = await res.json();
                setMocks(json);

                const keys = Object.keys(json).filter((k) => k !== "_fallback");
                if (keys.length > 0) setSelectedKey(keys[0]);
            } catch (err) {
                console.error(err);
                setError("Impossible de charger les mocks.");
            } finally {
                setLoading(false);
            }
        };

        fetchMocks();
    }, [navigate]);

    const current = selectedKey ? mocks[selectedKey] : null;

    const updateCurrentEntry = (updater: (prev: MockEntry) => MockEntry) => {
        if (!selectedKey || !current) return;
        setMocks((prev) => ({
            ...prev,
            [selectedKey]: updater(prev[selectedKey]),
        }));
    };

    // ------------------------------------------
    // 💾 Sauvegarder (JWT obligatoire)
    // ------------------------------------------
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setInfo(null);

        try {
            const token = localStorage.getItem("clinia_admin_token");

            if (!token) {
                navigate("/admin-login");
                return;
            }

            const res = await fetch(`${API_URL}/api/mocks`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(mocks),
            });

            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem("clinia_admin_token");
                navigate("/admin-login");
                return;
            }

            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || "Erreur lors de la sauvegarde.");
            }

            setInfo("Mocks sauvegardés avec succès !");
        } catch (err: any) {
            setError(err.message || "Erreur inconnue.");
        } finally {
            setSaving(false);
        }
    };

    // ------------------------------------------
    // Ajouter / supprimer une condition
    // ------------------------------------------
    const handleAddCondition = () => {
        const baseKey = "nouvelle_condition";
        let newKey = baseKey;
        let i = 1;
        while (mocks[newKey]) newKey = `${baseKey}_${i++}`;

        const newEntry: MockEntry = {
            match: [newKey],
            patient_summary: "Résumé patient à personnaliser.",
            treatments: [],
        };

        setMocks((prev) => ({ ...prev, [newKey]: newEntry }));
        setSelectedKey(newKey);
    };

    const handleDeleteCondition = () => {
        if (!selectedKey) return;
        if (!confirm(`Supprimer "${selectedKey}" ?`)) return;

        setMocks((prev) => {
            const copy = { ...prev };
            delete copy[selectedKey];
            return copy;
        });

        setSelectedKey(null);
    };

    // ------------------------------------------
    // Ajouter / supprimer un traitement
    // ------------------------------------------
    const handleAddTreatment = () => {
        if (!current) return;
        updateCurrentEntry((prev) => ({
            ...prev,
            treatments: [
                ...prev.treatments,
                {
                    name: "Nouveau traitement",
                    justification: "",
                    contraindications: [],
                    efficacy: 50,
                },
            ],
        }));
    };

    const handleDeleteTreatment = (index: number) => {
        updateCurrentEntry((prev) => ({
            ...prev,
            treatments: prev.treatments.filter((_, i) => i !== index),
        }));
    };

    // ------------------------------------------
    // 🕒 Loading
    // ------------------------------------------
    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 py-8">
                <p className="text-gray-500 text-sm">Chargement des mocks…</p>
            </div>
        );
    }

    // ------------------------------------------
    // UI COMPLET
    // ------------------------------------------
    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        ClinIA Mock Studio (Admin)
                    </h1>
                    <p className="text-sm text-gray-600">
                        Éditeur des réponses simulées par diagnostic.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? "Sauvegarde…" : "Sauvegarder"}
                </button>
            </header>

            {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
            )}

            {info && (
                <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm">{info}</div>
            )}

            {/* Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* ---- Liste diagnostics ---- */}
                <aside className="md:col-span-1 border rounded-xl bg-white p-3 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-gray-800">
                            Diagnostics disponibles
                        </h2>
                        <button
                            onClick={handleAddCondition}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        >
                            + Ajouter
                        </button>
                    </div>

                    <ul className="space-y-1 max-h-[400px] overflow-y-auto text-sm">
                        {Object.keys(mocks)
                            .filter((k) => k !== "_fallback")
                            .map((key) => (
                                <li key={key}>
                                    <button
                                        onClick={() => setSelectedKey(key)}
                                        className={`w-full text-left px-2 py-1 rounded ${
                                            selectedKey === key
                                                ? "bg-blue-50 text-blue-700 font-medium"
                                                : "hover:bg-gray-100"
                                        }`}
                                    >
                                        {key}
                                    </button>
                                </li>
                            ))}
                    </ul>

                    <p className="text-xs text-gray-400 pt-3 border-t">
                        `_fallback` = utilisé si aucune correspondance.
                    </p>
                </aside>

                {/* ---- Éditeur ---- */}
                <main className="md:col-span-2 border rounded-xl bg-white p-4 space-y-4">
                    {!selectedKey || !current ? (
                        <p className="text-sm text-gray-500">
                            Sélectionne un diagnostic dans la colonne de gauche.
                        </p>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">
                                        {selectedKey}
                                    </h2>
                                    <p className="text-xs text-gray-500">
                                        Clé interne du mock.
                                    </p>
                                </div>

                                <button
                                    onClick={handleDeleteCondition}
                                    className="text-xs px-3 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100"
                                >
                                    Supprimer
                                </button>
                            </div>

                            {/* Match */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Mots-clés (match)
                                </label>
                                <input
                                    type="text"
                                    className="w-full border rounded-lg px-2 py-1 text-sm"
                                    value={current.match.join(", ")}
                                    onChange={(e) => {
                                        const parts = e.target.value
                                            .split(",")
                                            .map((s) => s.trim())
                                            .filter(Boolean);
                                        updateCurrentEntry((prev) => ({
                                            ...prev,
                                            match: parts,
                                        }));
                                    }}
                                />
                            </div>

                            {/* Résumé patient */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Résumé patient
                                </label>
                                <textarea
                                    className="w-full border rounded-lg px-2 py-1 text-sm min-h-[80px]"
                                    value={current.patient_summary}
                                    onChange={(e) =>
                                        updateCurrentEntry((prev) => ({
                                            ...prev,
                                            patient_summary: e.target.value,
                                        }))
                                    }
                                />
                            </div>

                            {/* Traitements */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-gray-800">
                                        Traitements
                                    </h3>
                                    <button
                                        onClick={handleAddTreatment}
                                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                                    >
                                        + Ajouter
                                    </button>
                                </div>

                                {current.treatments.map((t, index) => (
                                    <div key={index} className="border rounded-lg p-3 space-y-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <input
                                                type="text"
                                                className="flex-1 border rounded px-2 py-1 mr-2"
                                                value={t.name}
                                                onChange={(e) =>
                                                    updateCurrentEntry((prev) => {
                                                        const c = [...prev.treatments];
                                                        c[index] = { ...c[index], name: e.target.value };
                                                        return { ...prev, treatments: c };
                                                    })
                                                }
                                                placeholder="Nom du traitement"
                                            />
                                            <button
                                                onClick={() => handleDeleteTreatment(index)}
                                                className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100"
                                            >
                                                Supprimer
                                            </button>
                                        </div>

                                        {/* Justification */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                                                Justification
                                            </label>
                                            <textarea
                                                className="w-full border rounded px-2 py-1 text-xs"
                                                value={t.justification}
                                                onChange={(e) =>
                                                    updateCurrentEntry((prev) => {
                                                        const c = [...prev.treatments];
                                                        c[index] = { ...c[index], justification: e.target.value };
                                                        return { ...prev, treatments: c };
                                                    })
                                                }
                                            />
                                        </div>

                                        {/* CI + efficacité */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                                    Contre-indications
                                                </label>
                                                <input
                                                    type="text"
                                                    className="w-full border rounded px-2 py-1 text-xs"
                                                    value={t.contraindications.join(", ")}
                                                    onChange={(e) =>
                                                        updateCurrentEntry((prev) => {
                                                            const c = [...prev.treatments];
                                                            c[index] = {
                                                                ...c[index],
                                                                contraindications: e.target.value
                                                                    .split(",")
                                                                    .map((s) => s.trim())
                                                                    .filter(Boolean),
                                                            };
                                                            return { ...prev, treatments: c };
                                                        })
                                                    }
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                                    Efficacité (%)
                                                </label>
                                                <input
                                                    type="number"
                                                    className="w-full border rounded px-2 py-1 text-xs"
                                                    value={t.efficacy}
                                                    min={0}
                                                    max={100}
                                                    onChange={(e) =>
                                                        updateCurrentEntry((prev) => {
                                                            const c = [...prev.treatments];
                                                            c[index] = {
                                                                ...c[index],
                                                                efficacy: Number(e.target.value) || 0,
                                                            };
                                                            return { ...prev, treatments: c };
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};

export default MockStudio;
