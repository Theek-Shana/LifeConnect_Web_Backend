


import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Patient from "../models/patient.model.js";

const activityTracker = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const now = new Date();

    if (decoded.role === "patient") {
      // Update patient lastActive
      await Patient.findByIdAndUpdate(
        decoded.id,
        { lastActive: now },
        { new: false } // don't wait for result - fire and forget
      ).catch(() => {}); // ignore errors
    } else {
      // Update user (doctor/caregiver/admin) lastActive
      await User.findByIdAndUpdate(
        decoded.id,
        { lastActive: now },
        { new: false }
      ).catch(() => {});
    }
  } catch {
   
  }
  next();
};

export default activityTracker;