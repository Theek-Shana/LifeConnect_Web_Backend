import express from "express";
import MedicalSession from "../models/medicalSession.model.js";
import { requireAuth, requireDoctor } from "../middleware/auth.js";

const router = express.Router();

// Get all sessions for a doctor
router.get("/doctor/:doctorId", requireAuth, async (req, res) => {
  try {
    // If logged-in user is doctor, use their own id (safer)
    const doctorId = req.user.role === "doctor" ? req.user.id : req.params.doctorId;

    const sessions = await MedicalSession.find({ doctor: doctorId })
      .populate("patient", "name age condition gender email phone")
      .populate("caregiver", "fullName email")
      .sort({ createdAt: -1 });

    res.json({ success: true, sessions });
  } catch (err) {
    console.log("❌ Error fetching sessions:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get pending sessions for a doctor
router.get("/doctor/:doctorId/pending", requireAuth, async (req, res) => {
  try {
    const doctorId = req.user.role === "doctor" ? req.user.id : req.params.doctorId;

    const sessions = await MedicalSession.find({
      doctor: doctorId,
      status: "pending",
    })
      .populate("patient", "name age condition gender email phone")
      .populate("caregiver", "fullName email")
      .sort({ createdAt: -1 });

    res.json({ success: true, sessions });
  } catch (err) {
    console.log("❌ Error fetching pending sessions:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Accept a session request - doctor can update time and add meeting link
router.post("/:sessionId/accept", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionLink, confirmedDate, confirmedTime } = req.body;

    console.log("📥 Accept request for session:", sessionId);
    console.log("📥 Request body:", req.body);

    const session = await MedicalSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    console.log("📋 Current session status:", session.status);

    // Update session with acceptance details
    session.status = "approved";
    session.sessionLink = sessionLink || "";
    session.confirmedDate = confirmedDate || session.requestedDate;
    session.confirmedTime = confirmedTime || session.requestedTime;
    session.approvedAt = new Date();

    const savedSession = await session.save();
    console.log("✅ Session saved with status:", savedSession.status);

    // Populate the response
    const updatedSession = await MedicalSession.findById(sessionId)
      .populate("patient", "name age condition")
      .populate("caregiver", "fullName email");

    res.json({
      success: true,
      message: "Session accepted successfully",
      session: updatedSession,
    });
  } catch (err) {
    console.log("❌ Error accepting session:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reject a session request
router.post("/:sessionId/reject", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { rejectionReason } = req.body;

    console.log("📥 Reject request for session:", sessionId);

    const session = await MedicalSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    session.status = "rejected";
    session.rejectionReason = rejectionReason || "";
    session.rejectedAt = new Date();

    const savedSession = await session.save();
    console.log("✅ Session rejected, status:", savedSession.status);

    res.json({
      success: true,
      message: "Session rejected",
      session: savedSession,
    });
  } catch (err) {
    console.log("❌ Error rejecting session:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update session details (time, link, etc.)
router.put("/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionLink, confirmedDate, confirmedTime, status } = req.body;

    const session = await MedicalSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Update fields if provided
    if (sessionLink !== undefined) session.sessionLink = sessionLink;
    if (confirmedDate) session.confirmedDate = confirmedDate;
    if (confirmedTime) session.confirmedTime = confirmedTime;
    if (status) session.status = status;

    await session.save();

    const updatedSession = await MedicalSession.findById(sessionId)
      .populate("patient", "name age condition")
      .populate("caregiver", "fullName email");

    res.json({
      success: true,
      message: "Session updated successfully",
      session: updatedSession,
    });
  } catch (err) {
    console.log("❌ Error updating session:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mark session as completed
router.post("/:sessionId/complete", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log("📥 Complete request for session:", sessionId);

    const session = await MedicalSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    session.status = "completed";
    session.completedAt = new Date();

    const savedSession = await session.save();
    console.log("✅ Session completed, status:", savedSession.status);

    const updatedSession = await MedicalSession.findById(sessionId)
      .populate("patient", "name age condition")
      .populate("caregiver", "fullName email");

    res.json({
      success: true,
      message: "Session marked as completed",
      session: updatedSession,
    });
  } catch (err) {
    console.log("❌ Error completing session:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});
// Get all sessions for a patient (Admin view)
router.get("/patient/:patientId", requireAuth, async (req, res) => {
  try {
    const sessions = await MedicalSession.find({ patient: req.params.patientId })
      .populate("doctor", "fullName email")
      .populate("caregiver", "fullName email")
      .sort({ createdAt: -1 });

    res.json({ success: true, sessions });
  } catch (err) {
    console.log("❌ Error fetching patient sessions:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});
export default router;