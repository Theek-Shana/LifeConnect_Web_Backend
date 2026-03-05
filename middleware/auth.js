import jwt from "jsonwebtoken";


export const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    console.error("Auth error:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};


export const authenticateToken = requireAuth;

// Role-based middleware
export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }
  next();
};

export const requireDoctor = (req, res, next) => {
  if (!req.user || (req.user.role !== "doctor" && req.user.role !== "admin")) {
    return res.status(403).json({
      success: false,
      message: "Doctor access required",
    });
  }
  next();
};

export const requireCaregiver = (req, res, next) => {
  if (!req.user || (req.user.role !== "caregiver" && req.user.role !== "admin")) {
    return res.status(403).json({
      success: false,
      message: "Caregiver access required",
    });
  }
  next();
};

export const requirePatient = (req, res, next) => {
  if (!req.user || req.user.role !== "patient") {
    return res.status(403).json({
      success: false,
      message: "Patient access required",
    });
  }
  next();
};