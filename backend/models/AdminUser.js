import mongoose from "mongoose";

const AdminUserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
});

export const AdminUser = mongoose.model("AdminUser", AdminUserSchema);
