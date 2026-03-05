import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { requireAuth } from "../middleware/auth.js";

// ✅ FIX: Import the shared Patient model instead of redefining it inline.
//    This was the root cause — the inline schema had NO isActive field,
//    so Mongoose silently ignored the toggle-active update.
import Patient from "../models/patient.model.js";

const router = express.Router();

// ==================== ADMIN ROUTES ====================

// Create new patient (Admin / Doctor)
router.post("/", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "doctor") {
      return res.status(403).json({
        success: false,
        message: "Only admins and doctors can create patients",
      });
    }

    const {
      name,
      email,
      password,
      age,
      gender,
      phone,
      address,
      medicalHistory,
      condition,
      caregiver_id,
      doctor_id,
    } = req.body;

    if (!name || !email || !password || !age || !gender) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, age, and gender are required",
      });
    }

    const existingPatient = await Patient.findOne({
      email: email.toLowerCase(),
    });
    if (existingPatient) {
      return res.status(400).json({
        success: false,
        message: "A patient with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newPatient = await Patient.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      age,
      gender,
      phone: phone || "",
      address: address || "",
      medicalHistory: medicalHistory || "",
      condition: condition || "",
      caregiver_id: caregiver_id || null,
      doctor_id: req.user.role === "doctor" ? req.user.id : (doctor_id || null),
      status: "active",
      isActive: true, // ✅ always initialise both fields
    });

    const patientResponse = {
      _id: newPatient._id,
      name: newPatient.name,
      email: newPatient.email,
      age: newPatient.age,
      gender: newPatient.gender,
      phone: newPatient.phone,
      address: newPatient.address,
      medicalHistory: newPatient.medicalHistory,
      condition: newPatient.condition,
      status: newPatient.status,
      isActive: newPatient.isActive,
      caregiver_id: newPatient.caregiver_id,
      doctor_id: newPatient.doctor_id,
      created_at: newPatient.created_at,
    };

    res.status(201).json({
      success: true,
      message: "Patient added successfully",
      patient: patientResponse,
    });
  } catch (error) {
    console.error("Error creating patient:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// Get all patients (Admin, Doctor, Caregiver)
router.get("/", requireAuth, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === "caregiver") {
      filter.caregiver_id = req.user.id;
    } else if (req.user.role === "doctor") {
      filter.doctor_id = req.user.id;
    }

    const patients = await Patient.find(filter)
      .select("-password")
      .populate("caregiver_id", "fullName email phone")
      .populate("doctor_id", "fullName email phone");

    res.json({ success: true, patients });
  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get single patient
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .select("-password")
      .populate("caregiver_id", "fullName email phone")
      .populate("doctor_id", "fullName email phone");

    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    if (
      req.user.role === "caregiver" &&
      patient.caregiver_id?.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied" });
    }

    res.json({ success: true, patient });
  } catch (error) {
    console.error("Error fetching patient:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update patient (Admin, Doctor, or assigned Caregiver)
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    if (
      req.user.role === "caregiver" &&
      patient.caregiver_id?.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied" });
    }

    const {
      name,
      email,
      age,
      gender,
      phone,
      address,
      medicalHistory,
      condition,
      status,
      caregiver_id,
      doctor_id,
    } = req.body;

    if (name) patient.name = name;
    if (email) {
      const emailExists = await Patient.findOne({
        email: email.toLowerCase(),
        _id: { $ne: req.params.id },
      });
      if (emailExists) {
        return res
          .status(400)
          .json({ success: false, message: "Email already in use" });
      }
      patient.email = email.toLowerCase();
    }
    if (age) patient.age = age;
    if (gender) patient.gender = gender;
    if (phone !== undefined) patient.phone = phone;
    if (address !== undefined) patient.address = address;
    if (medicalHistory !== undefined) patient.medicalHistory = medicalHistory;
    if (condition !== undefined) patient.condition = condition;

    if (req.user.role === "admin") {
      if (status) {
        patient.status = status;
        // ✅ keep isActive in sync when status is updated via PUT
        patient.isActive = status === "active";
      }
      if (caregiver_id !== undefined) patient.caregiver_id = caregiver_id;
      if (doctor_id !== undefined) patient.doctor_id = doctor_id;
    }

    await patient.save();

    const updatedPatient = await Patient.findById(req.params.id)
      .select("-password")
      .populate("caregiver_id", "fullName email phone")
      .populate("doctor_id", "fullName email phone");

    res.json({
      success: true,
      message: "Patient updated successfully",
      patient: updatedPatient,
    });
  } catch (error) {
    console.error("Error updating patient:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// Reset patient password (Admin only)
router.put("/:id/password", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Admin access required" });
    }

    const { newPassword } = req.body;

    if (!newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "New password is required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    patient.password = await bcrypt.hash(newPassword, 10);
    await patient.save();

    res.json({
      success: true,
      message: "Patient password updated successfully",
    });
  } catch (error) {
    console.error("Error resetting patient password:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// Delete patient (Admin only)
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can delete patients",
      });
    }

    const patient = await Patient.findByIdAndDelete(req.params.id);

    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    res.json({ success: true, message: "Patient deleted successfully" });
  } catch (error) {
    console.error("Error deleting patient:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==================== PATIENT AUTH ROUTES ====================

// Patient Login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const patient = await Patient.findOne({ email: email.toLowerCase() });

    if (!patient) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    // ✅ Check both status AND isActive so either field being inactive blocks login
    if (patient.status !== "active" || patient.isActive === false) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is inactive. Please contact your caregiver.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, patient.password);

    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    patient.lastLogin = new Date();
    await patient.save();

    const jwt = await import("jsonwebtoken");
    const token = jwt.default.sign(
      { id: patient._id.toString(), role: "patient", email: patient.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const patientData = {
      _id: patient._id,
      name: patient.name,
      email: patient.email,
      age: patient.age,
      gender: patient.gender,
      condition: patient.condition,
      status: patient.status,
      isActive: patient.isActive,
      caregiver_id: patient.caregiver_id,
      doctor_id: patient.doctor_id,
    };

    res.json({
      success: true,
      message: "Login successful",
      token,
      patient: patientData,
    });
  } catch (error) {
    console.error("Error during patient login:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// Get patient profile (for logged-in patient)
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is for patients only",
      });
    }

    const patient = await Patient.findById(req.user.id)
      .select("-password")
      .populate("caregiver_id", "fullName email phone")
      .populate("doctor_id", "fullName email phone");

    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    res.json({ success: true, patient });
  } catch (error) {
    console.error("Error fetching patient profile:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update patient password (logged-in patient — self-service)
router.put("/auth/change-password", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is for patients only",
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const patient = await Patient.findById(req.user.id);

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      patient.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    patient.password = await bcrypt.hash(newPassword, 10);
    await patient.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ==================== TOGGLE ACTIVE ====================

// PATCH /api/patients/:id/toggle-active
router.patch("/:id/toggle-active", requireAuth, async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "isActive must be a boolean" });
    }

    // ✅ FIX: Update BOTH isActive (boolean) AND status (string) together
    //    so both fields are always in sync in MongoDB.
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      {
        isActive: isActive,
        status: isActive ? "active" : "inactive",
      },
      { new: true, select: "-password" }
    );

    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    res.json({
      success: true,
      message: `Patient ${isActive ? "activated" : "deactivated"} successfully`,
      patient,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;