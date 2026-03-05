import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import crypto from "crypto";

const router = express.Router();

// ─── Helper: SHA256 (matches your login hash) ─────────────────────────────────
const sha256 = (password) =>
  crypto.createHash("sha256").update(password).digest("hex");

// Create new user (doctor/caregiver) - Admin only
router.post("/", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { fullName, email, password, phone, address, role } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required",
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const newUser = await User.create({
      fullName,
      email: email.toLowerCase(),
      password: sha256(password),
      phone: phone || "",
      address: address || "",
      role: role || "doctor",
    });

    const userResponse = {
      _id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      phone: newUser.phone,
      address: newUser.address,
      role: newUser.role,
    };

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get all users (for listing doctors/caregivers)
router.get("/", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { role } = req.query;
    const filter = role ? { role } : {};

    const users = await User.find(filter).select("-password");
    res.json({ success: true, users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE user (doctor/caregiver) - Admin only
router.put("/:id", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { fullName, email, phone, address, role } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (email && email.toLowerCase() !== user.email) {
      const emailExists = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: req.params.id },
      });
      if (emailExists) {
        return res.status(400).json({ success: false, message: "Email already in use" });
      }
      user.email = email.toLowerCase();
    }

    if (fullName) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (role) user.role = role;

    await user.save();

    const userResponse = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: user.role,
    };

    res.json({
      success: true,
      message: "User updated successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─── RESET PASSWORD (Admin only) ──────────────────────────────────────────────
// PUT /api/users/:id/password
router.put("/:id/password", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ success: false, message: "New password is required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Use SHA256 to match your existing login verification
    user.password = sha256(newPassword);
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// DELETE user (doctor/caregiver) - Admin only
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    if (req.params.id === req.user.id) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot delete your own account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;