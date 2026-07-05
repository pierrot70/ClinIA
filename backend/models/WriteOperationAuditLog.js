import mongoose from "mongoose";

const ReplicaSetSummarySchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: ["OK", "DEGRADED", "LAGGING", "INCIDENT", "UNKNOWN"],
            default: "UNKNOWN",
        },
        memberCount: {
            type: Number,
            default: null,
        },
        healthyCount: {
            type: Number,
            default: null,
        },
        primaryCount: {
            type: Number,
            default: null,
        },
        secondaryCount: {
            type: Number,
            default: null,
        },
        majorityAvailable: {
            type: Boolean,
            default: null,
        },
        maxLagSeconds: {
            type: Number,
            default: null,
        },
        laggingThresholdSeconds: {
            type: Number,
            default: null,
        },
        checkedAt: {
            type: Date,
            default: null,
        },
    },
    { _id: false }
);

const WriteOperationAuditLogSchema = new mongoose.Schema(
    {
        collectionName: {
            type: String,
            required: true,
            index: true,
            maxlength: 80,
        },
        operation: {
            type: String,
            enum: ["CREATE", "READ", "UPDATE", "DELETE", "REPLY", "UPSERT"],
            required: true,
            index: true,
        },
        outcome: {
            type: String,
            enum: ["SUCCESS", "FAILED"],
            required: true,
            index: true,
        },
        verificationId: {
            type: String,
            default: null,
            index: true,
            maxlength: 120,
        },
        clientMutationId: {
            type: String,
            default: null,
            index: true,
            maxlength: 120,
        },
        actorUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            default: null,
        },
        actorUsernameMasked: {
            type: String,
            default: "unknown",
        },
        actorRole: {
            type: String,
            default: null,
        },
        ip: {
            type: String,
            default: null,
        },
        requestId: {
            type: String,
            default: null,
            index: true,
        },
        instanceId: {
            type: String,
            default: null,
        },
        resourceId: {
            type: String,
            default: null,
            index: true,
            maxlength: 120,
        },
        changedFields: {
            type: [String],
            default: [],
        },
        requestPath: {
            type: String,
            default: null,
        },
        writeConcern: {
            w: {
                type: mongoose.Schema.Types.Mixed,
                default: null,
            },
            j: {
                type: Boolean,
                default: null,
            },
            wtimeout: {
                type: Number,
                default: null,
            },
        },
        replicaSet: {
            type: ReplicaSetSummarySchema,
            default: null,
        },
        dataClassification: {
            type: String,
            enum: ["NO_PATIENT_IDENTIFIERS"],
            default: "NO_PATIENT_IDENTIFIERS",
        },
        errorCode: {
            type: String,
            default: null,
            maxlength: 120,
        },
        timestamp: {
            type: Date,
            required: true,
            default: Date.now,
            index: true,
        },
    },
    { timestamps: true }
);

WriteOperationAuditLogSchema.index({ collectionName: 1, timestamp: -1 });
WriteOperationAuditLogSchema.index({ "replicaSet.status": 1, timestamp: -1 });
WriteOperationAuditLogSchema.index({ verificationId: 1, timestamp: -1 });
WriteOperationAuditLogSchema.index({ clientMutationId: 1, timestamp: -1 });

export const WriteOperationAuditLog =
    mongoose.models.WriteOperationAuditLog ||
    mongoose.model("WriteOperationAuditLog", WriteOperationAuditLogSchema);
