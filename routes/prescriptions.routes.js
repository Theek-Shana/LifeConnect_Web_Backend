// routes/prescriptions.routes.js
// Generates a professional .docx prescription, saves to DB, and streams file to client

import express from "express";
import mongoose from "mongoose";
import { requireAuth as authMiddleware } from "../middleware/auth.js";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign,
} from "docx";

const router = express.Router();

// ── Prescription Schema ──────────────────────────────────────
const prescriptionSchema = new mongoose.Schema(
  {
    patientId:    { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorId:     { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
    doctorName:   { type: String },
    clinicName:   { type: String },
    clinicPhone:  { type: String },
    clinicAddress:{ type: String },
    diagnosis:    { type: String },
    medications:  [{
      name: String, dosage: String, frequency: String,
      duration: String, instructions: String,
    }],
    advice:       { type: String },
    followUpDate: { type: String },
    rxId:         { type: String },
    status:       { type: String, enum: ["active", "dispensed"], default: "active" },
  },
  { timestamps: true }
);

const Prescription = mongoose.models.Prescription
  || mongoose.model("Prescription", prescriptionSchema, "prescriptions");

// ── Helpers ──────────────────────────────────────────────────
const border  = (color = "E3F2FD") => ({ style: BorderStyle.SINGLE, size: 1, color });
const allBorders = (color) => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });
const cell = (children, opts = {}) => new TableCell({
  borders: allBorders(opts.borderColor || "E3F2FD"),
  shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
  width: { size: opts.width || 1, type: WidthType.DXA },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  verticalAlign: VerticalAlign.CENTER,
  children,
});
const bold   = (text, size = 22, color = "0D47A1") => new TextRun({ text: String(text ?? "—"), bold: true, size, color, font: "Calibri" });
const normal = (text, size = 20, color = "37474F") => new TextRun({ text: String(text ?? "—"), size, color, font: "Calibri" });
const small  = (text, color = "78909C") => new TextRun({ text: String(text ?? ""), size: 16, color, font: "Calibri" });
const para   = (children, opts = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [children],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { before: opts.before || 0, after: opts.after || 120 },
  border: opts.border,
});

// ── POST /api/prescriptions/generate ─── Doctor generates Rx ─
router.post("/generate", authMiddleware, async (req, res) => {
  try {
    const {
      doctorName    = "Doctor",
      clinicName    = "LifeConnect Health",
      clinicPhone   = "",
      clinicAddress = "",
      patientId,
      diagnosis     = "",
      medications   = [],
      advice        = "",
      followUpDate  = "",
    } = req.body;

    // Fetch patient from DB
    let patientName   = req.body.patientName   || "Patient";
    let patientAge    = req.body.patientAge    || "";
    let patientGender = req.body.patientGender || "";

    if (patientId) {
      try {
        const patient = await mongoose.connection
          .collection("patients")
          .findOne({ _id: new mongoose.Types.ObjectId(patientId) });
        if (patient) {
          patientName   = patient.name   || patientName;
          patientAge    = patient.age    || patientAge;
          patientGender = patient.gender || patientGender;
        }
      } catch (_) { /* use defaults */ }
    }

    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const rxId  = `RX-${Date.now().toString(36).toUpperCase()}`;
    const filteredMeds = medications.filter(m => m.name);

    // ── Save to database ─────────────────────────────────────
    await Prescription.create({
      patientId:    patientId || null,
      doctorId:     req.user.id,
      doctorName,
      clinicName,
      clinicPhone,
      clinicAddress,
      diagnosis,
      medications:  filteredMeds,
      advice,
      followUpDate,
      rxId,
      status: "active",
    });

    console.log(`✅ Prescription ${rxId} saved to DB for patient ${patientName}`);

    // ── Build .docx ──────────────────────────────────────────
    const medRows = filteredMeds.map((m, i) => new TableRow({
      children: [
        cell([para([bold(`${i + 1}`, 22, "1565C0")])], { width: 480, bg: "F8FBFF" }),
        cell([para([bold(m.name, 22, "0D47A1")]), para([normal(m.dosage, 19)])], { width: 2200, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
        cell([para([normal(m.frequency, 20)])], { width: 1400, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
        cell([para([normal(m.duration, 20)])], { width: 1280, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
        cell([para([normal(m.instructions || "—", 20)])], { width: 2000, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
      ],
    }));

    const medHeaderRow = new TableRow({
      tableHeader: true,
      children: [
        cell([para([bold("#", 18, "FFFFFF")])],            { width: 480,  bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("MEDICATION", 18, "FFFFFF")])],   { width: 2200, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("FREQUENCY", 18, "FFFFFF")])],    { width: 1400, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("DURATION", 18, "FFFFFF")])],     { width: 1280, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("INSTRUCTIONS", 18, "FFFFFF")])], { width: 2000, bg: "1565C0", borderColor: "1565C0" }),
      ],
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
        },
        children: [
          para([bold(clinicName, 36, "0D47A1")], { after: 60 }),
          ...(clinicAddress || clinicPhone ? [
            para([small(`${clinicAddress}${clinicAddress && clinicPhone ? "  ·  " : ""}${clinicPhone}`)], { after: 60 }),
          ] : []),
          para([bold(`Dr. ${doctorName}`, 24, "1565C0")], { after: 180,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1565C0", space: 4 } }
          }),

          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [1200, 8160],
            rows: [new TableRow({ children: [
              cell([para([bold("Rx", 72, "FFFFFF")], { align: AlignmentType.CENTER })],
                { width: 1200, bg: "0D47A1", borderColor: "0D47A1" }),
              cell([
                new Table({
                  width: { size: 7960, type: WidthType.DXA },
                  columnWidths: [3980, 3980],
                  borders: { top: border("E3F2FD"), bottom: border("E3F2FD"), left: border("E3F2FD"), right: border("E3F2FD"), insideH: border("E3F2FD"), insideV: border("E3F2FD") },
                  rows: [
                    new TableRow({ children: [
                      cell([para([small("PATIENT NAME")]), para([bold(patientName, 24, "0D47A1")], { before: 40 })], { width: 3980, bg: "E3F2FD" }),
                      cell([para([small("DATE")]),         para([bold(today, 22, "0D47A1")], { before: 40 })],        { width: 3980, bg: "E3F2FD" }),
                    ]}),
                    new TableRow({ children: [
                      cell([para([small("AGE")]),    para([bold(patientAge ? `${patientAge} years` : "—", 22, "0D47A1")], { before: 40 })], { width: 3980, bg: "F8FBFF" }),
                      cell([para([small("GENDER")]), para([bold(patientGender || "—", 22, "0D47A1")], { before: 40 })],                     { width: 3980, bg: "F8FBFF" }),
                    ]}),
                    new TableRow({ children: [
                      cell([para([small("PRESCRIPTION ID")]), para([bold(rxId, 18, "546E7A")], { before: 40 })],            { width: 3980, bg: "E3F2FD" }),
                      cell([para([small("ISSUED BY")]),       para([bold(`Dr. ${doctorName}`, 20, "0D47A1")], { before: 40 })], { width: 3980, bg: "E3F2FD" }),
                    ]}),
                  ],
                }),
              ], { width: 8160 }),
            ]})],
          }),

          para([], { before: 240 }),
          para([bold("DIAGNOSIS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
          new Table({
            width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
            rows: [new TableRow({ children: [cell([para([normal(diagnosis || "—", 22, "37474F")])], { width: 9360, bg: "FFF8E1", borderColor: "FFE082" })] })],
          }),

          para([], { before: 200 }),
          para([bold("PRESCRIBED MEDICATIONS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
          ...(medRows.length > 0
            ? [new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [480, 2200, 1400, 1280, 2000], rows: [medHeaderRow, ...medRows] })]
            : [para([normal("No medications prescribed.", 20)])]),

          para([], { before: 200 }),
          ...(advice ? [
            para([bold("ADVICE & INSTRUCTIONS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
            new Table({
              width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
              rows: [new TableRow({ children: [cell([para([normal(advice, 21, "33691E")])], { width: 9360, bg: "F1F8E9", borderColor: "AED581" })] })],
            }),
            para([], { before: 160 }),
          ] : []),

          ...(followUpDate ? [
            para([bold("FOLLOW-UP DATE", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
            para([new TextRun({ text: "📅  Please return on:  ", size: 22, color: "0D47A1", font: "Calibri" }), bold(followUpDate, 24, "1565C0")], { after: 160 }),
          ] : []),

          para([], { before: 400, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E0E0E0", space: 4 } } }),
          new Table({
            width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680],
            rows: [new TableRow({ children: [
              cell([para([small(`Issued: ${today}`)]), para([small(`ID: ${rxId}`)], { before: 40 })], { width: 4680 }),
              cell([
                para([normal("_______________________________", 22, "BDBDBD")], { align: AlignmentType.RIGHT }),
                para([bold(`Dr. ${doctorName}`, 22, "0D47A1")], { align: AlignmentType.RIGHT, before: 60 }),
                para([small("Signature & Stamp")], { align: AlignmentType.RIGHT }),
              ], { width: 4680 }),
            ]})],
          }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="Prescription_${patientName.replace(/\s+/g, "_")}_${rxId}.docx"`);
    res.send(buffer);

  } catch (e) {
    console.error("❌ Prescription error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── GET /api/prescriptions/patient/:patientId ─── Caregiver fetches Rx list ─
router.get("/patient/:patientId", authMiddleware, async (req, res) => {
  try {
    const prescriptions = await Prescription
      .find({ patientId: req.params.patientId })
      .sort({ createdAt: -1 });
    res.json({ success: true, prescriptions });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── GET /api/prescriptions/:id/download ─── Re-download a saved Rx as .docx ─
router.get("/:id/download", authMiddleware, async (req, res) => {
  try {
    const rx = await Prescription.findById(req.params.id);
    if (!rx) return res.status(404).json({ success: false, message: "Prescription not found" });

    const today = new Date(rx.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const filteredMeds = (rx.medications || []).filter(m => m.name);

    const medRows = filteredMeds.map((m, i) => new TableRow({
      children: [
        cell([para([bold(`${i + 1}`, 22, "1565C0")])], { width: 480, bg: "F8FBFF" }),
        cell([para([bold(m.name, 22, "0D47A1")]), para([normal(m.dosage, 19)])], { width: 2200, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
        cell([para([normal(m.frequency, 20)])], { width: 1400, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
        cell([para([normal(m.duration, 20)])], { width: 1280, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
        cell([para([normal(m.instructions || "—", 20)])], { width: 2000, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
      ],
    }));

    const medHeaderRow = new TableRow({
      tableHeader: true,
      children: [
        cell([para([bold("#", 18, "FFFFFF")])],            { width: 480,  bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("MEDICATION", 18, "FFFFFF")])],   { width: 2200, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("FREQUENCY", 18, "FFFFFF")])],    { width: 1400, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("DURATION", 18, "FFFFFF")])],     { width: 1280, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("INSTRUCTIONS", 18, "FFFFFF")])], { width: 2000, bg: "1565C0", borderColor: "1565C0" }),
      ],
    });

    const doc = new Document({
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children: [
          para([bold(rx.clinicName || "LifeConnect Health", 36, "0D47A1")], { after: 60 }),
          ...(rx.clinicAddress || rx.clinicPhone ? [
            para([small(`${rx.clinicAddress || ""}${rx.clinicAddress && rx.clinicPhone ? "  ·  " : ""}${rx.clinicPhone || ""}`)], { after: 60 }),
          ] : []),
          para([bold(`Dr. ${rx.doctorName}`, 24, "1565C0")], { after: 180, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1565C0", space: 4 } } }),

          para([], { before: 240 }),
          para([bold("DIAGNOSIS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
          new Table({
            width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
            rows: [new TableRow({ children: [cell([para([normal(rx.diagnosis || "—", 22)])], { width: 9360, bg: "FFF8E1", borderColor: "FFE082" })] })],
          }),

          para([], { before: 200 }),
          para([bold("PRESCRIBED MEDICATIONS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
          ...(medRows.length > 0
            ? [new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [480, 2200, 1400, 1280, 2000], rows: [medHeaderRow, ...medRows] })]
            : [para([normal("No medications prescribed.", 20)])]),

          para([], { before: 200 }),
          ...(rx.advice ? [
            para([bold("ADVICE & INSTRUCTIONS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
            new Table({
              width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
              rows: [new TableRow({ children: [cell([para([normal(rx.advice, 21, "33691E")])], { width: 9360, bg: "F1F8E9", borderColor: "AED581" })] })],
            }),
            para([], { before: 160 }),
          ] : []),

          ...(rx.followUpDate ? [
            para([bold("FOLLOW-UP DATE", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
            para([new TextRun({ text: "📅  Please return on:  ", size: 22, color: "0D47A1", font: "Calibri" }), bold(rx.followUpDate, 24, "1565C0")], { after: 160 }),
          ] : []),

          para([], { before: 400, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E0E0E0", space: 4 } } }),
          new Table({
            width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680],
            rows: [new TableRow({ children: [
              cell([para([small(`Issued: ${today}`)]), para([small(`ID: ${rx.rxId}`)], { before: 40 })], { width: 4680 }),
              cell([
                para([normal("_______________________________", 22, "BDBDBD")], { align: AlignmentType.RIGHT }),
                para([bold(`Dr. ${rx.doctorName}`, 22, "0D47A1")], { align: AlignmentType.RIGHT, before: 60 }),
                para([small("Signature & Stamp")], { align: AlignmentType.RIGHT }),
              ], { width: 4680 }),
            ]})],
          }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="Prescription_${rx.rxId}.docx"`);
    res.send(buffer);

  } catch (e) {
    console.error("❌ Download error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});
// ── GET /api/prescriptions/:id/download ─────────────────────
// Caregiver downloads the .docx for a specific prescription
router.get("/:id/download", authMiddleware, async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id);
    if (!prescription)
      return res.status(404).json({ success: false, message: "Prescription not found" });

    // Mark as read
    await Prescription.findByIdAndUpdate(req.params.id, { isRead: true });

    // Fetch patient info
    let patientName = "Patient", patientAge = "", patientGender = "";
    try {
      const patient = await mongoose.connection.collection("patients").findOne(
        { _id: new mongoose.Types.ObjectId(prescription.patientId) }
      );
      if (patient) {
        patientName   = patient.name   || patientName;
        patientAge    = patient.age    || patientAge;
        patientGender = patient.gender || patientGender;
      }
    } catch (_) {}

    const { doctorName, clinicName, clinicPhone, clinicAddress,
            diagnosis, medications, advice, followUpDate, rxId } = prescription;

    const today = new Date(prescription.createdAt).toLocaleDateString("en-US",
      { year: "numeric", month: "long", day: "numeric" });

    // Build same .docx as doctor's version
    const medRows = (medications || [])
      .filter(m => m.name)
      .map((m, i) => new TableRow({
        children: [
          cell([para([bold(`${i + 1}`, 22, "1565C0")])], { width: 480, bg: "F8FBFF" }),
          cell([para([bold(m.name, 22, "0D47A1")]), para([normal(m.dosage, 19)])], { width: 2200, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
          cell([para([normal(m.frequency, 20)])], { width: 1400, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
          cell([para([normal(m.duration, 20)])], { width: 1280, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
          cell([para([normal(m.instructions || "—", 20)])], { width: 2000, bg: i % 2 ? "F8FBFF" : "FFFFFF" }),
        ],
      }));

    const medHeaderRow = new TableRow({
      tableHeader: true,
      children: [
        cell([para([bold("#", 18, "FFFFFF")])],            { width: 480,  bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("MEDICATION", 18, "FFFFFF")])],   { width: 2200, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("FREQUENCY", 18, "FFFFFF")])],    { width: 1400, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("DURATION", 18, "FFFFFF")])],     { width: 1280, bg: "1565C0", borderColor: "1565C0" }),
        cell([para([bold("INSTRUCTIONS", 18, "FFFFFF")])], { width: 2000, bg: "1565C0", borderColor: "1565C0" }),
      ],
    });

    const doc = new Document({
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children: [
          para([bold(clinicName || "LifeConnect Health", 36, "0D47A1")], { after: 60 }),
          ...(clinicAddress || clinicPhone ? [para([small(`${clinicAddress || ""}${clinicAddress && clinicPhone ? "  ·  " : ""}${clinicPhone || ""}`)], { after: 60 })] : []),
          para([bold(`Dr. ${doctorName}`, 24, "1565C0")], { after: 180, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1565C0", space: 4 } } }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [1200, 8160],
            rows: [new TableRow({ children: [
              cell([para([bold("Rx", 72, "FFFFFF")], { align: AlignmentType.CENTER })], { width: 1200, bg: "0D47A1", borderColor: "0D47A1" }),
              cell([new Table({
                width: { size: 7960, type: WidthType.DXA },
                columnWidths: [3980, 3980],
                borders: { top: border("E3F2FD"), bottom: border("E3F2FD"), left: border("E3F2FD"), right: border("E3F2FD"), insideH: border("E3F2FD"), insideV: border("E3F2FD") },
                rows: [
                  new TableRow({ children: [
                    cell([para([small("PATIENT NAME")]), para([bold(patientName, 24, "0D47A1")], { before: 40 })], { width: 3980, bg: "E3F2FD" }),
                    cell([para([small("DATE")]),         para([bold(today, 22, "0D47A1")], { before: 40 })],        { width: 3980, bg: "E3F2FD" }),
                  ]}),
                  new TableRow({ children: [
                    cell([para([small("AGE")]),    para([bold(patientAge ? `${patientAge} years` : "—", 22, "0D47A1")], { before: 40 })], { width: 3980, bg: "F8FBFF" }),
                    cell([para([small("GENDER")]), para([bold(patientGender || "—", 22, "0D47A1")], { before: 40 })],                     { width: 3980, bg: "F8FBFF" }),
                  ]}),
                  new TableRow({ children: [
                    cell([para([small("PRESCRIPTION ID")]), para([bold(rxId, 18, "546E7A")], { before: 40 })],               { width: 3980, bg: "E3F2FD" }),
                    cell([para([small("ISSUED BY")]),        para([bold(`Dr. ${doctorName}`, 20, "0D47A1")], { before: 40 })], { width: 3980, bg: "E3F2FD" }),
                  ]}),
                ],
              })], { width: 8160 }),
            ]})],
          }),
          para([], { before: 240 }),
          para([bold("DIAGNOSIS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
          new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360], rows: [new TableRow({ children: [cell([para([normal(diagnosis || "—", 22, "37474F")])], { width: 9360, bg: "FFF8E1", borderColor: "FFE082" })] })] }),
          para([], { before: 200 }),
          para([bold("PRESCRIBED MEDICATIONS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
          ...(medRows.length > 0 ? [new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [480, 2200, 1400, 1280, 2000], rows: [medHeaderRow, ...medRows] })] : [para([normal("No medications prescribed.", 20)])]),
          para([], { before: 200 }),
          ...(advice ? [
            para([bold("ADVICE & INSTRUCTIONS", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
            new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360], rows: [new TableRow({ children: [cell([para([normal(advice, 21, "33691E")])], { width: 9360, bg: "F1F8E9", borderColor: "AED581" })] })] }),
            para([], { before: 160 }),
          ] : []),
          ...(followUpDate ? [
            para([bold("FOLLOW-UP DATE", 22, "546E7A")], { after: 80, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E0E0E0", space: 2 } } }),
            para([new TextRun({ text: "📅  Please return on:  ", size: 22, color: "0D47A1", font: "Calibri" }), bold(followUpDate, 24, "1565C0")], { after: 160 }),
          ] : []),
          para([], { before: 400, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E0E0E0", space: 4 } } }),
          new Table({
            width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680],
            rows: [new TableRow({ children: [
              cell([para([small(`Issued: ${today}`)]), para([small(`ID: ${rxId}`)], { before: 40 })], { width: 4680 }),
              cell([
                para([normal("_______________________________", 22, "BDBDBD")], { align: AlignmentType.RIGHT }),
                para([bold(`Dr. ${doctorName}`, 22, "0D47A1")], { align: AlignmentType.RIGHT, before: 60 }),
                para([small("Signature & Stamp")], { align: AlignmentType.RIGHT }),
              ], { width: 4680 }),
            ]})],
          }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="Prescription_${patientName.replace(/\s+/g, "_")}_${rxId}.docx"`);
    res.send(buffer);

  } catch (e) {
    console.error("❌ Download error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});
export default router;