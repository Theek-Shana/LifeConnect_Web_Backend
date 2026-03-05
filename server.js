import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/users.routes.js";
import patientRoutes from "./routes/patients.routes.js"; 
import doctorRequestsRoutes from "./routes/doctorRequests.routes.js";
import medicalSessionsRoutes from "./routes/medicalSessions.routes.js";
import medicalNotesRoutes from "./routes/medicalNotes.routes.js";
import progressNotesRoutes from "./routes/progressNotes.routes.js";   
import prescriptionsRoutes from "./routes/prescriptions.routes.js";  
import activityTracker from "./middleware/activityTracker.js";   

dotenv.config();

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());
app.use(activityTracker);   

app.get("/", (req, res) => {
  res.json({ success: true, message: "🚀 LifeConnect API running" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/patients", patientRoutes); 
app.use("/api/doctor-requests", doctorRequestsRoutes);
app.use("/api/medical-sessions", medicalSessionsRoutes);
app.use("/api/medical-notes", medicalNotesRoutes);
app.use("/api/progress-notes", progressNotesRoutes);   
app.use("/api/prescriptions",  prescriptionsRoutes); 

const port = process.env.PORT || 5003;

connectDB()
  .then(() => {
    app.listen(port, '0.0.0.0', () => console.log(`✅ Server running: http://localhost:${port}`));
  })
  .catch((err) => {
    console.error("❌ DB connect error:", err.message);
    process.exit(1);
  });