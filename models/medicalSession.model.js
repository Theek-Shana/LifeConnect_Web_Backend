import mongoose from "mongoose";

const medicalSessionSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    caregiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedDate: { 
      type: String, 
      required: true 
    },
    requestedTime: { 
      type: String, 
      required: true 
    },
    confirmedDate: { 
      type: String, 
      default: "" 
    },
    confirmedTime: { 
      type: String, 
      default: "" 
    },
    notes: { 
      type: String, 
      default: "" 
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
    },
    sessionLink: { 
      type: String, 
      default: "" 
    },
    rejectionReason: { 
      type: String, 
      default: "" 
    },
    approvedAt: { 
      type: Date 
    },
    rejectedAt: { 
      type: Date 
    },
    completedAt: { 
      type: Date 
    },
  },
  {
    timestamps: true,
    collection: "medical_sessions",
  }
);

const MedicalSession =
  mongoose.models.MedicalSession ||
  mongoose.model("MedicalSession", medicalSessionSchema);

export default MedicalSession;