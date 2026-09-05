import mongoose from "mongoose";
import {
    buildPatientSearchKeys,
    HEALTH_INSURANCE_JURISDICTIONS,
    normalizeHealthInsuranceJurisdiction,
    normalizePatientCountry,
} from "../utils/patientSearchKeys.js";

/* ------------------------------------------------------------------ */
/* Patient Schema                                                      */
/* ------------------------------------------------------------------ */

const ClinicalAnalysisParametersSchema = new mongoose.Schema(
    {
        age: Number,
        sex: { type: String, trim: true },
        country: { type: String, trim: true },
        ethnicity: { type: String, trim: true },
        diagnosis: { type: String, trim: true },
        weight: Number,
        height: Number,
        blood_pressure: {
            systolic: Number,
            diastolic: Number,
        },
        symptoms: { type: [String], default: [] },
        medical_history: { type: [String], default: [] },
        current_medications: { type: [String], default: [] },
        diabetes_context: {
            cardiovascular_risk: { type: String, trim: true },
            renal_function: { type: String, trim: true },
            fragility: { type: String, trim: true },
            tolerance: { type: String, trim: true },
            glycemic_goals: { type: String, trim: true },
        },
    },
    { _id: false }
);

const SecureRequestProfileSchema = new mongoose.Schema(
    {
        objective: {
            type: String,
            default: "",
            trim: true,
        },
        sex: {
            type: String,
            default: "",
            trim: true,
        },
        age: {
            type: String,
            default: "",
            trim: true,
        },
        current_medications: {
            type: String,
            default: "",
            trim: true,
        },
        clinicalAnalysisParameters: {
            type: ClinicalAnalysisParametersSchema,
            default: undefined,
        },
        selected_document_ids: {
            type: [String],
            default: [],
        },
        clinicalScope: {
            type: String,
            default: "",
            trim: true,
        },
        ageGroup: {
            type: String,
            default: "",
            trim: true,
        },
        symptomProfile: {
            type: String,
            default: "",
            trim: true,
        },
        cancerType: {
            type: String,
            default: "",
            trim: true,
        },
        duration: {
            type: String,
            default: "",
            trim: true,
        },
        severity: {
            type: String,
            default: "",
            trim: true,
        },
        redFlagStatus: {
            type: String,
            default: "",
            trim: true,
        },
        comorbidityContext: {
            type: String,
            default: "",
            trim: true,
        },
        clinicalNotes: {
            type: String,
            default: "",
            trim: true,
        },
        privacyAttestation: {
            type: Boolean,
            default: false,
        },
        lastRequestedAt: {
            type: Date,
        },
    },
    {
        _id: false,
    }
);

const PatientDocumentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            default: "",
            trim: true,
        },
        storageKey: {
            type: String,
            default: "",
            trim: true,
        },
        uploadedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        _id: true,
    }
);

const PatientSchema = new mongoose.Schema(
    {
        nom: {
            type: String,
            required: true,
            trim: true,
        },
        prenom: {
            type: String,
            required: true,
            trim: true,
        },
        num_assurance_maladie: {
            type: String,
            default: "",
            trim: true,
        },
        addresse: {
            type: String,
            default: "",
            trim: true,
        },
        telephone: {
            type: String,
            default: undefined,
            trim: true,
        },
        courriel: {
            type: String,
            default: "",
            trim: true,
            lowercase: true,
        },
        created_by_reference: {
            type: String,
            default: "",
            trim: true,
        },
        ownerUserId: {
            // Permanent care holder. Reception-created walk-in patients have
            // no holder until a physician explicitly accepts ongoing care.
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            index: true,
        },
        archivedAt: {
            type: Date,
            default: null,
            index: true,
        },
        archivedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            default: null,
        },
        archiveReason: {
            type: String,
            default: "",
            trim: true,
            maxlength: 500,
        },
        country: {
            type: String,
            enum: ["CA"],
            default: "CA",
            trim: true,
        },
        healthInsuranceJurisdiction: {
            type: String,
            enum: HEALTH_INSURANCE_JURISDICTIONS,
            default: "UNKNOWN",
            trim: true,
        },
        nomSearch: {
            type: String,
            default: "",
            select: false,
        },
        prenomSearch: {
            type: String,
            default: "",
            select: false,
        },
        addresseSearch: {
            type: String,
            default: "",
            select: false,
        },
        telephoneSearch: {
            type: String,
            default: null,
            select: false,
        },
        healthInsuranceNumberSearch: {
            type: String,
            default: null,
            select: false,
        },
        texto: {
            type: Boolean,
            default: false,
        },
        language: {
            type: String,
            enum: ["fr", "en", "es", "ko", "vi", "no", "ja", "zh", "he"],
            default: "fr",
            trim: true,
        },
        lat: {
            type: Number,
        },
        long: {
            type: Number,
        },
        secure_request_profile: {
            type: SecureRequestProfileSchema,
            default: undefined,
        },
        documents: {
            type: [PatientDocumentSchema],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

PatientSchema.pre("validate", function populateSearchKeys() {
    this.country = normalizePatientCountry(this.country);
    this.healthInsuranceJurisdiction = normalizeHealthInsuranceJurisdiction(
        this.healthInsuranceJurisdiction,
        this.num_assurance_maladie
    );
    Object.assign(this, buildPatientSearchKeys(this));
});

PatientSchema.index(
    { ownerUserId: 1, nomSearch: 1 },
    { name: "owner_nom_search_idx" }
);
PatientSchema.index(
    { ownerUserId: 1, prenomSearch: 1 },
    { name: "owner_prenom_search_idx" }
);
PatientSchema.index(
    { ownerUserId: 1, addresseSearch: 1 },
    { name: "owner_addresse_search_idx" }
);
PatientSchema.index(
    { ownerUserId: 1, telephoneSearch: 1 },
    {
        name: "owner_telephone_unique_idx",
        unique: true,
        partialFilterExpression: {
            telephoneSearch: { $type: "string" },
        },
    }
);
PatientSchema.index(
    {
        ownerUserId: 1,
        country: 1,
        healthInsuranceJurisdiction: 1,
        healthInsuranceNumberSearch: 1,
    },
    {
        name: "owner_health_insurance_number_unique_idx",
        unique: true,
        partialFilterExpression: {
            healthInsuranceNumberSearch: { $type: "string" },
        },
    }
);

export const Patient =
    mongoose.models.Patient ||
    mongoose.model("Patient", PatientSchema);
