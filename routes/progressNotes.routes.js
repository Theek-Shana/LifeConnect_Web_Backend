

import express from "express";
import mongoose from "mongoose";
import { requireAuth as authMiddleware } from "../middleware/auth.js"; 

const router = express.Router();

// ── Schema — guard against OverwriteModelError on nodemon reload ──
const progressNoteSchema = new mongoose.Schema(
  {
    patientId:  { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
    doctorName: { type: String },
    title:      { type: String, default: "Progress Note" },
    content:    { type: String, required: true },
    status: {
      type: String,
      enum: ["improving", "stable", "worsening", "critical"],
      default: "stable",
    },
  },
  { timestamps: true }
);

//  prevents OverwriteModelError on hot-reload
const ProgressNote = mongoose.models.ProgressNote
  || mongoose.model("ProgressNote", progressNoteSchema, "progress_notes");

// ── GET /api/progress-notes/:patientId ──────────────────────
router.get("/:patientId", authMiddleware, async (req, res) => {
  try {
    const notes = await ProgressNote.find({ patientId: req.params.patientId })
      .sort({ createdAt: -1 });
    res.json({ success: true, notes });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── POST /api/progress-notes ─────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { patientId, title, content, status } = req.body;
    if (!patientId || !content)
      return res.status(400).json({ success: false, message: "patientId and content are required" });

    const note = await ProgressNote.create({
      patientId,
      doctorId:   req.user.id,
      doctorName: req.user.fullName || req.user.name || req.user.email,
      title: title || "Progress Note",
      content,
      status: status || "stable",
    });

    res.status(201).json({ success: true, note });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── DELETE /api/progress-notes/:id ───────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await ProgressNote.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;