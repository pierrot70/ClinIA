import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    createPatient,
    deletePatient,
    fetchPatientsPaginated,
    updatePatient,
    type Patient,
    type PatientPayload,
} from "../services/patientsApi";
import type { ApiError } from "../types/api";
import { useDebounce } from "../hooks/useDebounce";

declare global {
    interface Window {
        google?: any;
    }
}

let mapsScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
    if (window.google?.maps?.places) {
        return Promise.resolve();
    }

    if (mapsScriptPromise) {
        return mapsScriptPromise;
    }

    mapsScriptPromise = new Promise((resolve, reject) => {
        const existing = document.getElementById(
            "google-maps-places"
        ) as HTMLScriptElement | null;

        if (existing) {
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () =>
                reject(new Error("Google Maps script error."))
            );
            return;
        }

        const script = document.createElement("script");
        script.id = "google-maps-places";
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
            apiKey
        )}&libraries=places`;
        script.onload = () => resolve();
        script.onerror = () =>
            reject(new Error("Google Maps script error."));
        document.head.appendChild(script);
    });

    return mapsScriptPromise;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function PatientsPage() {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 10;

    const [filterNom, setFilterNom] = useState("");
    const [filterPrenom, setFilterPrenom] = useState("");
    const [filterTelephone, setFilterTelephone] = useState("");
    const [filterRamq, setFilterRamq] = useState("");

    const rawFilters = useMemo(
        () => ({
            nom: filterNom,
            prenom: filterPrenom,
            telephone: filterTelephone,
            ramq: filterRamq,
        }),
        [filterNom, filterPrenom, filterTelephone, filterRamq]
    );

    const filters = useDebounce(rawFilters, 300);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({
        nom: "",
        prenom: "",
        num_assurance_maladie: "",
        addresse: "",
        telephone: "",
        courriel: "",
        lat: "",
        long: "",
        texto: false,
    });
    const [viewMode, setViewMode] = useState<"create" | "list">("list");
    const addressInputRef = useRef<HTMLInputElement | null>(null);
    const autocompleteRef = useRef<any>(null);

    useEffect(() => {
        if (viewMode !== "create") return;

        let cancelled = false;
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
            | string
            | undefined;

        if (!apiKey) {
            return;
        }

        async function initAutocomplete() {
            if (!addressInputRef.current || !window.google?.maps?.places) {
                return false;
            }

            autocompleteRef.current =
                new window.google.maps.places.Autocomplete(
                    addressInputRef.current,
                    {
                        types: ["address"],
                        fields: ["formatted_address", "geometry"],
                        componentRestrictions: { country: "ca" },
                    }
                );

            autocompleteRef.current.addListener(
                "place_changed",
                () => {
                    if (cancelled) return;
                    const place =
                        autocompleteRef.current.getPlace?.();
                    const formatted =
                        place?.formatted_address ?? "";
                    const lat =
                        place?.geometry?.location?.lat?.();
                    const lng =
                        place?.geometry?.location?.lng?.();

                    setForm((p) => ({
                        ...p,
                        addresse: formatted || p.addresse,
                        lat:
                            typeof lat === "number"
                                ? lat.toString()
                                : p.lat,
                        long:
                            typeof lng === "number"
                                ? lng.toString()
                                : p.long,
                    }));
                }
            );

            return true;
        }

        loadGoogleMapsScript(apiKey)
            .then(() => initAutocomplete())
            .catch(() => {
                // Silence: autocomplete will remain disabled.
            });

        return () => {
            cancelled = true;
            if (autocompleteRef.current && window.google?.maps?.event) {
                window.google.maps.event.clearInstanceListeners(
                    autocompleteRef.current
                );
            }
            autocompleteRef.current = null;
        };
    }, [viewMode]);

    useEffect(() => {
        loadPatients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    async function loadPatients() {
        setLoading(true);
        setError(null);

        const nomFilter = filters.nom || undefined;
        const prenomFilter = filters.prenom || undefined;
        const telFilter = filters.telephone || undefined;

        const baseQuery = {
            page,
            limit,
            nom: nomFilter,
            prenom: prenomFilter,
            num_assurance_maladie: filters.ramq || undefined,
        };

        const shouldUsePhoneOnly =
            !nomFilter && !prenomFilter && telFilter;

        const response = await fetchPatientsPaginated(
            shouldUsePhoneOnly
                ? { ...baseQuery, telephone: telFilter }
                : baseQuery
        );

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

        let data = response.data.data;
        let totalPages = response.data.meta.totalPages;

        if (
            telFilter &&
            !shouldUsePhoneOnly &&
            response.data.meta.total > 1
        ) {
            const refined = await fetchPatientsPaginated({
                ...baseQuery,
                telephone: telFilter,
            });

            if ("error" in refined) {
                setError(refined.error);
                setLoading(false);
                return;
            }

            data = refined.data.data;
            totalPages = refined.data.meta.totalPages;
        }

        setPatients(data);
        setTotalPages(totalPages);
        setLoading(false);
    }

    function resetForm() {
        setEditingId(null);
        setForm({
            nom: "",
            prenom: "",
            num_assurance_maladie: "",
            addresse: "",
            telephone: "",
            courriel: "",
            lat: "",
            long: "",
            texto: false,
        });
    }

    function toPayload(values: typeof form): PatientPayload {
        const payload: PatientPayload = {
            nom: values.nom.trim(),
            prenom: values.prenom.trim(),
            texto: values.texto,
        };

        if (values.num_assurance_maladie.trim()) {
            payload.num_assurance_maladie =
                values.num_assurance_maladie.trim();
        }
        if (values.addresse.trim()) {
            payload.addresse = values.addresse.trim();
        }
        if (values.telephone.trim()) {
            payload.telephone = values.telephone.trim();
        }
        if (values.courriel.trim()) {
            payload.courriel = values.courriel.trim();
        }
        if (values.lat.trim()) {
            const latValue = Number(values.lat.trim());
            if (!Number.isFinite(latValue)) {
                throw new Error("Latitude invalide.");
            }
            payload.lat = latValue;
        }
        if (values.long.trim()) {
            const longValue = Number(values.long.trim());
            if (!Number.isFinite(longValue)) {
                throw new Error("Longitude invalide.");
            }
            payload.long = longValue;
        }

        return payload;
    }

    async function handleSubmit() {
        if (!form.nom.trim() || !form.prenom.trim()) {
            setError({
                code: "INVALID_INPUT",
                message: "Nom et prénom sont requis.",
                retryable: false,
            });
            return;
        }

        setError(null);

        if (editingId) {
            let payload: PatientPayload;
            try {
                payload = toPayload(form);
            } catch (err) {
                setError({
                    code: "INVALID_INPUT",
                    message:
                        err instanceof Error
                            ? err.message
                            : "Coordonnées invalides.",
                    retryable: false,
                });
                return;
            }
            const response = await updatePatient(editingId, payload);
            if ("error" in response) {
                setError(response.error);
                return;
            }
        } else {
            let payload: PatientPayload;
            try {
                payload = toPayload(form);
            } catch (err) {
                setError({
                    code: "INVALID_INPUT",
                    message:
                        err instanceof Error
                            ? err.message
                            : "Coordonnées invalides.",
                    retryable: false,
                });
                return;
            }
            const response = await createPatient(payload);
            if ("error" in response) {
                setError(response.error);
                return;
            }
        }

        resetForm();
        await loadPatients();
    }

    async function handleEdit(patient: Patient) {
        setEditingId(patient._id);
        setViewMode("create");
            setForm({
                nom: patient.nom ?? "",
                prenom: patient.prenom ?? "",
                num_assurance_maladie: patient.num_assurance_maladie ?? "",
                addresse: patient.addresse ?? "",
                telephone: patient.telephone ?? "",
                courriel: patient.courriel ?? "",
                lat: patient.lat?.toString() ?? "",
                long: patient.long?.toString() ?? "",
                texto: Boolean(patient.texto),
            });
    }

    async function handleDelete(id: string) {
        const confirmed = window.confirm(
            "Supprimer ce patient définitivement ?"
        );
        if (!confirmed) return;

        setBusyIds((p) => ({ ...p, [id]: true }));
        setError(null);

        const response = await deletePatient(id);
        if ("error" in response) {
            setError(response.error);
            setBusyIds((p) => ({ ...p, [id]: false }));
            return;
        }

        setBusyIds((p) => ({ ...p, [id]: false }));
        await loadPatients();
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Patients</h1>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className={`px-4 py-2 rounded border font-semibold transition ${
                        viewMode === "create"
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => setViewMode("create")}
                >
                    Créer un patient
                </button>
                <button
                    type="button"
                    className={`px-4 py-2 rounded border font-semibold transition ${
                        viewMode === "list"
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => setViewMode("list")}
                >
                    Rechercher les patients
                </button>
            </div>

            {error && (
                <div className="text-sm text-red-600">
                    {error.message}
                </div>
            )}

            {viewMode === "create" && (
                <div className="grid grid-cols-1 gap-4 bg-gray-50 border rounded p-4">
                    <div className="text-sm font-medium">
                        {editingId
                            ? "Modifier un patient"
                            : "Créer un patient"}
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
                            placeholder="Numéro RAMQ (optionnel)"
                            value={form.num_assurance_maladie}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    num_assurance_maladie: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder="Téléphone (optionnel)"
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
                            placeholder="Courriel (optionnel)"
                            value={form.courriel}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    courriel: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder="Adresse (optionnel)"
                            value={form.addresse}
                            ref={addressInputRef}
                            autoComplete="off"
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    addresse: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder="Latitude (optionnel)"
                            value={form.lat}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    lat: e.target.value,
                                }))
                            }
                        />
                        <input
                            className="border rounded p-2"
                            placeholder="Longitude (optionnel)"
                            value={form.long}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    long: e.target.value,
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
            )}

            {viewMode === "list" && (
                <>
                    <div className="border rounded p-4 space-y-3">
                        <div className="text-sm font-medium">
                            Recherche
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                                placeholder="Téléphone"
                                value={filterTelephone}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterTelephone(e.target.value);
                                }}
                            />
                            <input
                                className="border rounded p-2"
                                placeholder="RAMQ"
                                value={filterRamq}
                                onChange={(e) => {
                                    setPage(1);
                                    setFilterRamq(e.target.value);
                                }}
                            />
                        </div>
                    </div>

                    <div className="border rounded overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100 text-gray-700">
                                <tr>
                                    <th className="text-left p-2">Nom</th>
                                    <th className="text-left p-2">Prénom</th>
                                    <th className="text-left p-2">Adresse</th>
                                    <th className="text-left p-2">Téléphone</th>
                                    <th className="text-left p-2">RAMQ</th>
                                    <th className="text-left p-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && (
                                    <tr>
                                        <td
                                            className="p-2 text-gray-500"
                                            colSpan={5}
                                        >
                                            Chargement…
                                        </td>
                                    </tr>
                                )}
                                {!loading && patients.length === 0 && (
                                    <tr>
                                        <td
                                            className="p-2 text-gray-500"
                                            colSpan={5}
                                        >
                                            Aucun patient trouvé.
                                        </td>
                                    </tr>
                                )}
                                {!loading &&
                                    patients.map((p) => (
                                        <tr
                                            key={p._id}
                                            className="border-t"
                                        >
                                            <td className="p-2">
                                                {p.nom}
                                            </td>
                                            <td className="p-2">
                                                {p.prenom}
                                            </td>
                                            <td className="p-2">
                                                {p.addresse || "—"}
                                            </td>
                                            <td className="p-2">
                                                {p.telephone || "—"}
                                            </td>
                                            <td className="p-2">
                                                {p.num_assurance_maladie}
                                            </td>
                                            <td className="p-2 flex gap-2">
                                                <Link
                                                    className="px-2 py-1 border rounded"
                                                    to={`/appointments?ramq=${encodeURIComponent(
                                                        p.num_assurance_maladie
                                                    )}`}
                                                >
                                                    Créer rendez-vous
                                                </Link>
                                                <button
                                                    className="px-2 py-1 border rounded"
                                                    onClick={() =>
                                                        handleEdit(p)
                                                    }
                                                >
                                                    Éditer
                                                </button>
                                                <button
                                                    className="px-2 py-1 border rounded text-red-600"
                                                    disabled={
                                                        busyIds[p._id]
                                                    }
                                                    onClick={() =>
                                                        handleDelete(p._id)
                                                    }
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
                                setPage((p) =>
                                    Math.min(p + 1, totalPages)
                                )
                            }
                        >
                            Suivant
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
