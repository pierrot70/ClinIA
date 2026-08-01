import { beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
    createPatientWithWriteVerification: vi.fn(),
    updatePatientWithWriteVerification: vi.fn(),
    updatePatientWithClinicalNoteHistory: vi.fn(),
    archivePatientWithWriteVerification: vi.fn(),
    restorePatientWithWriteVerification: vi.fn(),
    getPatientById: vi.fn(),
    listPatientAuditLogs: vi.fn(),
}));

const dto = vi.hoisted(() => ({
    toCreatePatientDTO: vi.fn(),
    toArchivePatientDTO: vi.fn(),
    toRestorePatientDTO: vi.fn(),
    toUpdatePatientDTO: vi.fn(),
}));

const { getReplicaSetStatus } = vi.hoisted(() => ({
    getReplicaSetStatus: vi.fn(),
}));

vi.mock("../../services/patients.js", () => ({
    ...services,
    listPatients: vi.fn(),
    listPatientSecureRequestDocuments: vi.fn(),
    listPatientClinicalNoteVersions: vi.fn(),
    restorePatientClinicalNoteVersion: vi.fn(),
}));

vi.mock("../../dto/patient.dto.js", () => dto);
vi.mock("../../services/dbStatus.js", () => ({ getReplicaSetStatus }));

import router from "../patients.js";

function makeRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

function getRouteHandler(method, path) {
    const layer = router.stack.find(
        (entry) => entry.route?.path === path && entry.route?.methods?.[method]
    );
    if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
    return layer.route.stack.at(-1).handle;
}

function request(overrides = {}) {
    return {
        body: {},
        headers: {},
        params: {},
        auth: { userId: "user-1", username: "doctor.one", role: "MEDECIN" },
        ip: "10.0.0.10",
        originalUrl: "/api/patients",
        requestContext: { requestId: "request-1", instanceId: "instance-a" },
        ...overrides,
    };
}

const replicaSet = { summary: { status: "OK", majorityAvailable: true } };
const receipt = { status: "CONFIRMED", verificationId: "WRV-TEST", clientMutationId: null };

describe("patient routes atomic write receipts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getReplicaSetStatus.mockResolvedValue(replicaSet);
    });

    it("creates the patient and its receipt through one transactional service", async () => {
        const handler = getRouteHandler("post", "/");
        const patient = { _id: "patient-1", nom: "Doe", prenom: "Jane" };
        dto.toCreatePatientDTO.mockReturnValue({ nom: "Doe", prenom: "Jane" });
        services.createPatientWithWriteVerification.mockResolvedValue({ patient, writeVerification: receipt });
        const req = request({ body: { nom: "Doe", prenom: "Jane" } });
        const res = makeRes();

        await handler(req, res);

        expect(services.createPatientWithWriteVerification).toHaveBeenCalledWith(
            { nom: "Doe", prenom: "Jane" },
            req.auth,
            expect.objectContaining({
                allowPotentialDuplicate: false,
                audit: expect.objectContaining({
                    action: "PATIENT_CREATE",
                    operation: "CREATE",
                    verificationId: expect.stringMatching(/^WRV-/),
                    changedFields: ["nom", "prenom"],
                    replicaSet,
                }),
            })
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            data: patient,
            meta: expect.objectContaining({ writeVerification: receipt }),
        }));
    });

    it("returns the same generic conflict response without revealing the conflicting identifier", async () => {
        const handler = getRouteHandler("post", "/");
        dto.toCreatePatientDTO.mockReturnValue({
            nom: "Doe",
            prenom: "Jane",
            telephone: "5145550101",
        });
        services.createPatientWithWriteVerification.mockRejectedValue({
            code: 11000,
            keyPattern: { telephoneSearch: 1 },
            keyValue: { telephoneSearch: "5145550101" },
        });
        const res = makeRes();

        await handler(request({ body: { nom: "Doe", prenom: "Jane" } }), res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "PATIENT_CONFLICT",
                message:
                    "Impossible d'enregistrer ce dossier avec ces informations. Vérifiez les données.",
                retryable: false,
            },
        });
        expect(JSON.stringify(res.json.mock.calls)).not.toContain("telephoneSearch");
        expect(JSON.stringify(res.json.mock.calls)).not.toContain("5145550101");
    });

    it("does not request a transaction for rejected unsafe clinical parameters", async () => {
        const handler = getRouteHandler("post", "/");
        dto.toCreatePatientDTO.mockReturnValue({
            nom: "Lasante",
            prenom: "Pierre",
            secure_request_profile: {
                clinicalAnalysisParameters: { diagnosis: "Migraine chez Pierre Lasante" },
            },
        });
        const res = makeRes();

        await handler(request(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(services.createPatientWithWriteVerification).not.toHaveBeenCalled();
    });

    it("returns invalid demographic DTO input as a client error before creating a patient", async () => {
        const handler = getRouteHandler("post", "/");
        dto.toCreatePatientDTO.mockImplementation(() => {
            throw {
                code: "INVALID_INPUT",
                message: "Le numéro de téléphone est invalide.",
            };
        });
        const res = makeRes();

        await handler(request({ body: { nom: "Lasante", prenom: "Pierre" } }), res);

        expect(services.createPatientWithWriteVerification).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "INVALID_INPUT",
                message: "Le numéro de téléphone est invalide.",
                retryable: false,
            },
        });
    });

    it("rejects an oversized clinical note before creating a patient", async () => {
        const handler = getRouteHandler("post", "/");
        const res = makeRes();

        await handler(
            request({
                body: {
                    nom: "Lasante",
                    prenom: "Pierre",
                    secure_request_profile: {
                        clinicalNotes: "x".repeat(10001),
                    },
                },
            }),
            res
        );

        expect(dto.toCreatePatientDTO).not.toHaveBeenCalled();
        expect(services.createPatientWithWriteVerification).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: expect.objectContaining({
                code: "INVALID_CLINICAL_INPUT_BOUNDARY",
                fields: ["secure_request_profile.clinicalNotes"],
            }),
        });
    });

    it("uses one transactional service for a non-note patient update", async () => {
        const handler = getRouteHandler("patch", "/:id");
        const patient = { _id: "patient-2", nom: "After", prenom: "Jane" };
        dto.toUpdatePatientDTO.mockReturnValue({ nom: "After" });
        services.getPatientById.mockResolvedValue({ _id: "patient-2", nom: "Before", prenom: "Jane" });
        services.updatePatientWithWriteVerification.mockResolvedValue({ patient, writeVerification: receipt });
        const req = request({ params: { id: "patient-2" }, body: { nom: "After" }, originalUrl: "/api/patients/patient-2" });
        const res = makeRes();

        await handler(req, res);

        expect(services.updatePatientWithWriteVerification).toHaveBeenCalledWith(
            "patient-2",
            { nom: "After" },
            req.auth,
            expect.objectContaining({
                audit: expect.objectContaining({
                    action: "PATIENT_UPDATE",
                    changedFields: ["nom"],
                }),
            })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("keeps clinical note updates on their transactional service", async () => {
        const handler = getRouteHandler("patch", "/:id");
        const profile = { clinicalNotes: "Nouvelle note." };
        dto.toUpdatePatientDTO.mockReturnValue({ secure_request_profile: profile });
        services.getPatientById.mockResolvedValue({
            _id: "patient-2",
            secure_request_profile: { clinicalNotes: "Ancienne note." },
        });
        services.updatePatientWithClinicalNoteHistory.mockResolvedValue({
            patient: { _id: "patient-2" }, noteVersion: { _id: "version-1" }, writeVerification: receipt,
        });
        const req = request({ params: { id: "patient-2" }, body: { secure_request_profile: profile } });
        const res = makeRes();

        await handler(req, res);

        expect(services.updatePatientWithClinicalNoteHistory).toHaveBeenCalledWith(
            "patient-2", { secure_request_profile: profile }, req.auth,
            expect.objectContaining({ audit: expect.objectContaining({ action: "PATIENT_UPDATE" }) })
        );
        expect(services.updatePatientWithWriteVerification).not.toHaveBeenCalled();
    });

    it("archives and restores through transactional services without retaining the reason in audit context", async () => {
        dto.toArchivePatientDTO.mockReturnValue({ reason: "Doublon confirmé" });
        dto.toRestorePatientDTO.mockReturnValue({ reason: "Demande administrative" });
        services.archivePatientWithWriteVerification.mockResolvedValue({ patient: { _id: "patient-3" }, writeVerification: receipt });
        services.restorePatientWithWriteVerification.mockResolvedValue({ patient: { _id: "patient-3" }, writeVerification: receipt });
        const archiveRes = makeRes();
        const restoreRes = makeRes();

        await getRouteHandler("delete", "/:id")(request({ params: { id: "patient-3" } }), archiveRes);
        await getRouteHandler("post", "/:id/restore")(request({ params: { id: "patient-3" } }), restoreRes);

        expect(services.archivePatientWithWriteVerification).toHaveBeenCalledWith(
            "patient-3", "Doublon confirmé", expect.any(Object),
            expect.objectContaining({ audit: expect.objectContaining({ context: null }) })
        );
        expect(services.restorePatientWithWriteVerification).toHaveBeenCalledWith(
            "patient-3", "Demande administrative", expect.any(Object),
            expect.objectContaining({ audit: expect.objectContaining({ context: null }) })
        );
    });
});
