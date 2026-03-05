import mongoose from "mongoose";

const medicalNoteSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    caregiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    note: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    
    doctorReply: {
      type: String,
      default: null,
    },
    doctorReplyAt: {
      type: Date,
      default: null,
    },
    doctorReplyBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const MedicalNote = mongoose.model(
  "MedicalNote",
  medicalNoteSchema,
  "medical_notes"
);

export default MedicalNote;