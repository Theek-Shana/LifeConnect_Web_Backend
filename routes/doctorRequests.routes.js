
import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Re-use already-registered Patient model
const Patient = mongoose.models.Patient || mongoose.model("Patient");


const doctorRequestSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    message: { type: String, default: "" },
  },
  { 
    timestamps: true,
    collection: "doctor_requests" 
  }
);


const DoctorRequest = mongoose.models.DoctorRequest || 
  mongoose.model("DoctorRequest", doctorRequestSchema, "doctor_requests");

/**
 * Create request (Caregiver/Admin)
 * POST /api/doctor-requests
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { patientId, doctorId, caregiverId, message } = req.body;

    if (!patientId || !doctorId || !caregiverId) {
      return res.status(400).json({
        success: false,
        message: "patientId, doctorId, caregiverId are required",
      });
    }

    if (req.user.role !== "caregiver" && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Caregiver/Admin access required" });
    }

    const doctorUser = await User.findById(doctorId);
    if (!doctorUser || doctorUser.role !== "doctor") {
      return res.status(400).json({ success: false, message: "Invalid doctorId" });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(400).json({ success: false, message: "Invalid patientId" });
    }

    const existing = await DoctorRequest.findOne({
      patient: patientId,
      doctor: doctorId,
      status: "pending",
    });

    if (existing) {
      return res.json({ success: true, message: "Request already pending", request: existing });
    }

    const request = await DoctorRequest.create({
      patient: patientId,
      doctor: doctorId,
      requestedBy: caregiverId,
      message: message || `${patient.name} would like you to be their healthcare provider.`,
      status: "pending",
    });

    res.json({ success: true, message: "Request sent", request });
  } catch (err) {
    console.error("Create doctor request error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * Doctor: Get my pending requests
 * GET /api/doctor-requests/pending
 */
router.get("/pending", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ success: false, message: "Doctor access required" });
    }

    // 🔍 ENHANCED DEBUGGING
    console.log("==========================================");
    console.log("🔍 PENDING REQUESTS DEBUG INFO:");
    console.log("==========================================");
    console.log("📋 Logged-in Doctor ID (from JWT):", req.user.id);
    console.log("📋 Doctor Email:", req.user.email);
    console.log("📋 Collection Name:", DoctorRequest.collection.name);

    // Check if doctor exists in User collection
    const doctorUser = await User.findById(req.user.id);
    console.log("👤 Doctor found in DB:", doctorUser ? "YES" : "NO");
    if (doctorUser) {
      console.log("👤 Doctor Name:", doctorUser.fullName);
    }

    // Convert string ID to ObjectId
    const doctorObjectId = new mongoose.Types.ObjectId(req.user.id);

    // Find ALL pending requests (for debugging)
    const allPending = await DoctorRequest.find({ status: "pending" })
      .populate("doctor", "fullName email role");
    
    console.log("📊 Total pending requests in DB:", allPending.length);
    
    if (allPending.length > 0) {
      console.log("📝 All pending requests:");
      allPending.forEach((req, idx) => {
        console.log(`   ${idx + 1}. ID: ${req._id}`);
        console.log(`      Doctor ID: ${req.doctor._id.toString()}`);
        console.log(`      Doctor Name: ${req.doctor?.fullName || 'N/A'}`);
        console.log(`      Status: ${req.status}`);
        console.log(`      Match with logged-in doctor: ${req.doctor._id.toString() === doctorObjectId.toString() ? "✅ YES" : "❌ NO"}`);
      });
    } else {
      console.log("⚠️  No pending requests found in database!");
      console.log("⚠️  Checking all collections...");
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log("📁 Available collections:", collections.map(c => c.name).join(", "));
    }

    // Find requests for this specific doctor
    const requests = await DoctorRequest.find({ 
      doctor: doctorObjectId, 
      status: "pending" 
    })
      .sort({ createdAt: -1 })
      .populate("patient", "name age gender email phone address condition medicalHistory")
      .populate("requestedBy", "fullName email phone role");

    console.log("✅ Requests found for this doctor:", requests.length);
    console.log("==========================================");
    
    res.json({ success: true, requests });
  } catch (err) {
    console.error("❌ Pending requests error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});


router.get("/debug/all-pending", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "doctor" && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const allRequests = await DoctorRequest.find({ status: "pending" })
      .populate("patient", "name age gender email")
      .populate("doctor", "fullName email role")
      .populate("requestedBy", "fullName email");

    res.json({ 
      success: true, 
      collectionName: DoctorRequest.collection.name,
      count: allRequests.length,
      yourDoctorId: req.user.id,
      requests: allRequests.map(r => ({
        _id: r._id,
        patientName: r.patient?.name,
        doctorId: r.doctor._id.toString(),
        doctorName: r.doctor?.fullName,
        doctorEmail: r.doctor?.email,
        isYours: r.doctor._id.toString() === req.user.id,
        status: r.status,
        createdAt: r.createdAt
      }))
    });
  } catch (err) {
    console.error("Debug error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Doctor: Accept
 * POST /api/doctor-requests/:id/accept
 */
router.post("/:id/accept", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ success: false, message: "Doctor access required" });
    }

    console.log("✅ Accepting request:", req.params.id);

    const request = await DoctorRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    // Proper ObjectId comparison
    if (request.doctor.toString() !== req.user.id.toString()) {
      console.log("❌ Authorization failed:");
      console.log("   Request doctor ID:", request.doctor.toString());
      console.log("   Logged-in doctor ID:", req.user.id.toString());
      return res.status(403).json({ success: false, message: "Not your request" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ success: false, message: "Request already processed" });
    }

    request.status = "accepted";
    await request.save();

    // Convert string ID to ObjectId when updating patient
    const doctorObjectId = new mongoose.Types.ObjectId(req.user.id);
    await Patient.findByIdAndUpdate(
      request.patient, 
      { doctor_id: doctorObjectId }, 
      { new: true }
    );

    console.log("✅ Request accepted and patient updated");

    res.json({ success: true, message: "Request accepted ✅" });
  } catch (err) {
    console.error("❌ Accept request error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * Doctor: Reject
 * POST /api/doctor-requests/:id/reject
 */
router.post("/:id/reject", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ success: false, message: "Doctor access required" });
    }

    console.log("❌ Rejecting request:", req.params.id);

    const request = await DoctorRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    // Proper ObjectId comparison
    if (request.doctor.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Not your request" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ success: false, message: "Request already processed" });
    }

    request.status = "rejected";
    await request.save();

    console.log("✅ Request rejected");

    res.json({ success: true, message: "Request rejected ❌" });
  } catch (err) {
    console.error("❌ Reject request error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// Get all doctor requests for a patient (Admin view)
router.get("/patient/:patientId", requireAuth, async (req, res) => {
  try {
    const requests = await DoctorRequest.find({ patient: req.params.patientId })
      .populate("doctor", "fullName email")
      .populate("requestedBy", "fullName email")
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;