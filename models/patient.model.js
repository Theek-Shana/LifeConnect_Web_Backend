import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ["Male", "Female"], required: true },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    medicalHistory: { type: String, default: "" },
    condition: { type: String, default: "" },


    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    isActive: { type: Boolean, default: true },

    caregiver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    profileImage: { type: String, default: "" },
    lastLogin: { type: Date, default: null },
    emergencyContact: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      relationship: { type: String, default: "" },
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

patientSchema.index({ email: 1 });
patientSchema.index({ caregiver_id: 1 });
patientSchema.index({ status: 1 });


const Patient =
  mongoose.models.Patient || mongoose.model("Patient", patientSchema);

export default Patient;