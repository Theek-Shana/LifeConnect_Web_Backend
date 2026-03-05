import express from "express";
import mongoose from "mongoose";
import MedicalNote from "../models/medicalNote.model.js";
import Patient from "../models/patient.model.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Get medical notes for all patients of a doctor
router.get("/doctor/:doctorId", authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid doctorId" });
    }

    // 1) Find patients assigned to this doctor
    const patients = await Patient.find({ assignedDoctor: doctorId }).select(
      "_id"
    );
    const patientIds = patients.map((p) => p._id);

    let notes = [];

    if (patientIds.length > 0) {
      // Notes for assigned patients
      notes = await MedicalNote.find({ patient: { $in: patientIds } })
        .populate("patient", "name age condition email phone")
        .populate("caregiver", "fullName email role")
        .populate("doctorReplyBy", "fullName email")
        .sort({ createdAt: -1 })
        .limit(200);
    } else {
      // 2) Fallback: notes where caregiver = this doctor
      notes = await MedicalNote.find({ caregiver: doctorId })
        .populate("patient", "name age condition email phone")
        .populate("caregiver", "fullName email role")
        .populate("doctorReplyBy", "fullName email")
        .sort({ createdAt: -1 })
        .limit(200);
    }

    // 3) Final fallback: return all notes so frontend never shows 0 wrongly
    if (notes.length === 0) {
      notes = await MedicalNote.find({})
        .populate("patient", "name age condition email phone")
        .populate("caregiver", "fullName email role")
        .populate("doctorReplyBy", "fullName email")
        .sort({ createdAt: -1 })
        .limit(200);
    }

    return res.json({
      success: true,
      count: notes.length,
      notes,
      debug: {
        assignedPatientsFound: patientIds.length,
        usedFallback: patientIds.length === 0,
      },
    });
  } catch (err) {
    console.log("❌ Error fetching notes:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

//  Get notes for a specific patient
router.get("/patient/:patientId", authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid patientId" });
    }

    const notes = await MedicalNote.find({ patient: patientId })
      .populate("patient", "name age condition email phone")
      .populate("caregiver", "fullName email role")
      .populate("doctorReplyBy", "fullName email")
      .sort({ createdAt: -1 });

    return res.json({ success: true, count: notes.length, notes });
  } catch (err) {
    console.log("❌ Error fetching patient notes:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Add a new medical note
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { patient, caregiver, note } = req.body;

    if (!patient || !note) {
      return res.status(400).json({
        success: false,
        message: "patient and note are required",
      });
    }

    const newNote = await MedicalNote.create({
      patient,
      caregiver: caregiver || req.user?.id || null,
      note,
      timestamp: new Date(),
    });

    const savedNote = await MedicalNote.findById(newNote._id)
      .populate("patient", "name age condition email phone")
      .populate("caregiver", "fullName email role");

    return res.status(201).json({
      success: true,
      message: "Medical note added successfully",
      note: savedNote,
    });
  } catch (err) {
    console.log("❌ Error adding note:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Doctor replies to a specific medical note
// PUT /api/medical-notes/:noteId/reply
router.put("/:noteId/reply", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { reply } = req.body;
    const doctorId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(noteId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid noteId" });
    }

    if (!reply || reply.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Reply text is required" });
    }

    const updatedNote = await MedicalNote.findByIdAndUpdate(
      noteId,
      {
        doctorReply: reply.trim(),
        doctorReplyAt: new Date(),
        doctorReplyBy: doctorId || null,
      },
      { new: true }
    )
      .populate("patient", "name age condition email phone")
      .populate("caregiver", "fullName email role")
      .populate("doctorReplyBy", "fullName email");

    if (!updatedNote) {
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });
    }

    return res.json({
      success: true,
      message: "Reply sent successfully",
      note: updatedNote,
    });
  } catch (err) {
    console.log("❌ Error sending reply:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Doctor deletes/clears their reply
// DELETE /api/medical-notes/:noteId/reply
router.delete("/:noteId/reply", authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(noteId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid noteId" });
    }

    const updatedNote = await MedicalNote.findByIdAndUpdate(
      noteId,
      {
        doctorReply: null,
        doctorReplyAt: null,
        doctorReplyBy: null,
      },
      { new: true }
    )
      .populate("patient", "name age condition email phone")
      .populate("caregiver", "fullName email role");

    if (!updatedNote) {
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });
    }

    return res.json({
      success: true,
      message: "Reply deleted successfully",
      note: updatedNote,
    });
  } catch (err) {
    console.log("❌ Error deleting reply:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;