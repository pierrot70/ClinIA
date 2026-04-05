import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/* Patient Schema                                                      */
/* ------------------------------------------------------------------ */

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
            required: true,
            unique: true,
            index: true,
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
            unique: true,
            sparse: true,
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
        texto: {
            type: Boolean,
            default: false,
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

export const Patient =
    mongoose.models.Patient ||
    mongoose.model("Patient", PatientSchema);
