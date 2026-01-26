import { useEffect, useMemo, useState } from "react";
import {
    createSpecialist,
    deleteSpecialist,
    fetchSpecialistsPaginated,
    updateSpecialist,
    type Specialist,
    type SpecialistPayload,
} from "../services/specialistsApi";
import type { ApiError } from "../types/api";
import { useDebounce } from "../hooks/useDebounce";

export function SpecialistsPage() {
    const [specialists, setSpecialists] = useState<Specialist[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 10;

    const [filterNom, setFilterNom] = useState("");
    const [filterPrenom, setFilterPrenom] = useState("");
    const [filterNumero, setFilterNumero] = useState("");
    const [filterTelephone, setFilterTelephone] = useState("");
    const [filterEmail, setFilterEmail] = useState("");
    const [filterClinique, setFilterClinique] = useState("");

    const rawFilters = useMemo(
        () => ({
            nom: filterNom,
            prenom: filterPrenom,
            numero_medecin: filterNumero,
            telephone: filterTelephone,
            email: filterEmail,
            clinique_associer: filterClinique,
        }),
        [
            filterNom,
            filterPrenom,
            filterNumero,
            filterTelephone,
            filterEmail,
            filterClinique,
        ]
    );

    const filters = useDebounce(rawFilters, 300);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({
        nom: "",
        prenom: "",
        numero_medecin: "",
        telephone: "",
        email: "",
        texto: false,
        clinique_associer: "",
    });

    useEffect(() => {
        loadSpecialists();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    async function loadSpecialists() {
        setLoading(true);
        setError(null);

        const response = await fetchSpecialistsPaginated({
            page,
            limit,
            nom: filters.nom || undefined,
            prenom: filters.prenom || undefined,
            numero_medecin: filters.numero_medecin || undefined,
            telephone: filters.telephone || undefined,
            email: filters.email || undefined,
            clinique_associer:
                filters.clinique_associer || undefined,
        });

        if ("error" in response) {
            setError(response.error);
            setLoading(false);
            return;
        }

        if (!response.data || !response.data.meta) {
            setError({
                code: "INTERNAL_ERROR",
                message:
                    "Réponse serveur invalide (pagination manquante).",
                retryable: false,
            });
            setLoading(false);
            return;
        }

        setSpecialists(response.data.data);
        setTotalPages(response.data.meta.totalPages);
        setLoading(false);
    }

    function resetForm() {
        setEditingId(null);
        setForm({
            nom: "",
            prenom: "",
            numero_medecin: "",
            telephone: "",
            email: "",
            texto: false,
            clinique_associer: "",
        });
    }

    function toPayload(values: typeof form): SpecialistPayload {
        const payload: SpecialistPayload = {
            nom: values.nom.trim(),
            prenom: values.prenom.trim(),
            numero_medecin: values.numero_medecin.trim(),
            texto: values.texto,
        };

        if (values.telephone.trim()) {
            payload.telephone = values.telephone.trim();
        }
        if (values.email.trim()) {
            payload.email = values.email.trim();
        }
        if (values.clinique_associer.trim()) {
            payload.clinique_associer = values.clinique_associer.trim();
        } else if (values.clinique_associer === "") {
            payload.clinique_associer = undefined;
        }

        return payload;
    }

    async function handleSubmit() {
        if (
            !form.nom.trim() ||
            !form.prenom.trim() ||
            !form.numero_medecin.trim()
        ) {
            setError({
                code: "INVALID_INPUT",
                message:
                    "Nom, prénom et numéro de médecin sont requis.",
                retryable: false,
            });
            return;
        }

        setError(null);

        if (editingId) {
            const response = await updateSpecialist(
                editingId,
                toPayload(form)
            );
            if ("error" in response) {
                setError(response.error);
                return;
            }
        } else {
            const response = await createSpecialist(toPayload(form));
            if ("error" in response) {
                setError(response.error);
                return;
            }
        }

        resetForm();
        await loadSpecialists();
    }

    async function handleEdit(specialist: Specialist) {
        setEditingId(specialist._id);
        setForm({
            nom: specialist.nom ?? "",
            prenom: specialist.prenom ?? "",
            numero_medecin: specialist.numero_medecin ?? "",
            telephone: specialist.telephone ?? "",
            email: specialist.email ?? "",
            texto: Boolean(specialist.texto),
            clinique_associer: specialist.clinique_associer ?? "",
        });
    }

    async function handleDelete(id: string) {
        const confirmed = window.confirm(
            "Supprimer ce spécialiste définitivement ?"
        );
        if (!confirmed) return;

        setBusyIds((p) => ({ ...p, [id]: true }));
        setError(null);

        const response = await deleteSpecialist(id);
        if ("error" in response) {
            setError(response.error);
            setBusyIds((p) => ({ ...p, [id]: false }));
            return;
        }

        setBusyIds((p) => ({ ...p, [id]: false }));
        await loadSpecialists();
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Spécialistes</h1>

            <div className="grid grid-cols-1 gap-4 bg-gray-50 border rounded p-4">
                <div className="text-sm font-medium">
                    {editingId
                        ? "Modifier un spécialiste"
                        : "Créer un spécialiste"}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                        className="border rounded p-2"
                        placeholder="Prénom *"
                        value={form.prenom}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                prenom: e.target.value,
                            }))
                        }
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Nom *"
                        value={form.nom}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                nom: e.target.value,
                            }))
                        }
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Numéro de médecin *"
                        value={form.numero_medecin}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                numero_medecin: e.target.value,
                            }))
                        }
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Téléphone"
                        value={form.telephone}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                telephone: e.target.value,
                            }))
                        }
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Courriel"
                        value={form.email}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                email: e.target.value,
                            }))
                        }
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Clinique associée (ID)"
                        value={form.clinique_associer}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                clinique_associer: e.target.value,
                            }))
                        }
                    />
                </div>

                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={form.texto}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                texto: e.target.checked,
                            }))
                        }
                    />
                    SMS activé
                </label>

                <div className="flex gap-2">
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-primary text-white rounded"
                    >
                        {editingId ? "Enregistrer" : "Créer"}
                    </button>
                    {editingId && (
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 border rounded"
                        >
                            Annuler
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="text-sm text-red-600">
                    {error.message}
                </div>
            )}

            <div className="border rounded p-4 space-y-3">
                <div className="text-sm font-medium">Recherche</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                        className="border rounded p-2"
                        placeholder="Nom"
                        value={filterNom}
                        onChange={(e) => {
                            setPage(1);
                            setFilterNom(e.target.value);
                        }}
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Prénom"
                        value={filterPrenom}
                        onChange={(e) => {
                            setPage(1);
                            setFilterPrenom(e.target.value);
                        }}
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Numéro de médecin"
                        value={filterNumero}
                        onChange={(e) => {
                            setPage(1);
                            setFilterNumero(e.target.value);
                        }}
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Téléphone"
                        value={filterTelephone}
                        onChange={(e) => {
                            setPage(1);
                            setFilterTelephone(e.target.value);
                        }}
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Courriel"
                        value={filterEmail}
                        onChange={(e) => {
                            setPage(1);
                            setFilterEmail(e.target.value);
                        }}
                    />
                    <input
                        className="border rounded p-2"
                        placeholder="Clinique associée (ID)"
                        value={filterClinique}
                        onChange={(e) => {
                            setPage(1);
                            setFilterClinique(e.target.value);
                        }}
                    />
                </div>
            </div>

            <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                        <tr>
                            <th className="text-left p-2">Prénom</th>
                            <th className="text-left p-2">Nom</th>
                            <th className="text-left p-2">
                                Numéro médecin
                            </th>
                            <th className="text-left p-2">Téléphone</th>
                            <th className="text-left p-2">Courriel</th>
                            <th className="text-left p-2">
                                Clinique
                            </th>
                            <th className="text-left p-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td
                                    className="p-2 text-gray-500"
                                    colSpan={7}
                                >
                                    Chargement…
                                </td>
                            </tr>
                        )}
                        {!loading && specialists.length === 0 && (
                            <tr>
                                <td
                                    className="p-2 text-gray-500"
                                    colSpan={7}
                                >
                                    Aucun spécialiste trouvé.
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            specialists.map((sp) => (
                                <tr key={sp._id} className="border-t">
                                    <td className="p-2">
                                        {sp.prenom}
                                    </td>
                                    <td className="p-2">{sp.nom}</td>
                                    <td className="p-2">
                                        {sp.numero_medecin}
                                    </td>
                                    <td className="p-2">
                                        {sp.telephone || "—"}
                                    </td>
                                    <td className="p-2">
                                        {sp.email || "—"}
                                    </td>
                                    <td className="p-2">
                                        {sp.clinique_associer || "—"}
                                    </td>
                                    <td className="p-2 flex gap-2">
                                        <button
                                            className="px-2 py-1 border rounded"
                                            onClick={() => handleEdit(sp)}
                                        >
                                            Éditer
                                        </button>
                                        <button
                                            className="px-2 py-1 border rounded text-red-600"
                                            disabled={busyIds[sp._id]}
                                            onClick={() => handleDelete(sp._id)}
                                        >
                                            Supprimer
                                        </button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center gap-3">
                <button
                    className="px-3 py-1 border rounded"
                    disabled={page <= 1}
                    onClick={() =>
                        setPage((p) => Math.max(p - 1, 1))
                    }
                >
                    Précédent
                </button>
                <span className="text-sm text-gray-600">
                    Page {page} / {totalPages}
                </span>
                <button
                    className="px-3 py-1 border rounded"
                    disabled={page >= totalPages}
                    onClick={() =>
                        setPage((p) => Math.min(p + 1, totalPages))
                    }
                >
                    Suivant
                </button>
            </div>
        </div>
    );
}
