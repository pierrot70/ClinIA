import mongoose from "mongoose";

const ClinicianCommentReplySchema = new mongoose.Schema(
    {
        responderUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            required: true,
        },
        responderUsername: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        responderRole: {
            type: String,
            enum: ["ADMIN", "SUPERADMIN"],
            required: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        createdAt: {
            type: Date,
            default: () => new Date(),
        },
    },
    { _id: true, id: false }
);

const ClinicianCommentSchema = new mongoose.Schema(
    {
        actorUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AdminUser",
            default: null,
            index: true,
        },
        actorUsername: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        actorRole: {
            type: String,
            enum: ["ANONYMOUS", "USER", "MEDECIN", "ADMIN", "SUPERADMIN"],
            required: true,
            index: true,
        },
        comment: {
            type: String,
            required: true,
            trim: true,
        },
        redactionCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        redactionTypes: {
            type: [String],
            default: [],
        },
        replies: {
            type: [ClinicianCommentReplySchema],
            default: [],
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        collection: "cliniciancomments",
    }
);

ClinicianCommentSchema.index({ createdAt: -1 });

export const ClinicianComment =
    mongoose.models.ClinicianComment ||
    mongoose.model("ClinicianComment", ClinicianCommentSchema);
