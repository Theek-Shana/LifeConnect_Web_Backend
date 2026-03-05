import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// ── Helper: SHA256 hash ────────────────────────────────────
const sha256 = (password) =>
  crypto.createHash("sha256").update(password).digest("hex");

// ── Helper: verify password ────────────────────────────────
const verifyPassword = async (plain, stored) => {
  if (!stored) return false;
  if (stored.startsWith("$2")) return await bcrypt.compare(plain, stored);
  if (stored.length === 64) return sha256(plain) === stored;
  return plain === stored;
};


const resetTokens = new Map();

// ── Cleanup expired tokens every hour ─────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of resetTokens.entries()) {
    if (data.expiresAt < now) resetTokens.delete(token);
  }
}, 60 * 60 * 1000);

//routes

// Create admin (run once)
router.post("/seed-admin", async (req, res) => {
  const { fullName, email, password } = req.body;
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.json({ success: true, message: "Admin already exists" });
  const hashed = await bcrypt.hash(password, 10);
  const admin = await User.create({
    fullName: fullName || "Admin",
    email: email.toLowerCase(),
    password: hashed,
    role: "admin",
  });
  res.json({ success: true, message: "Admin created", adminId: admin._id });
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email & password required" });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user)
    return res.status(401).json({ success: false, message: "Invalid credentials" });

  const isMatch = await verifyPassword(password, user.password);
  if (!isMatch)
    return res.status(401).json({ success: false, message: "Invalid credentials" });

  const token = jwt.sign(
    { id: user._id.toString(), role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    success: true,
    token,
    user: { _id: user._id, fullName: user.fullName, email: user.email, role: user.role },
  });
});

// Test token
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json({ success: true, user });
});


// FORGOT PASSWORD ROUTES


// POST /api/auth/forgot-password
// Sends reset email to user
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  console.log("🔑 Forgot password request for:", email);

  // Always return success (don't reveal if email exists)
  if (!email) {
    return res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user) {
      // ✅ Create transporter here so env vars are already loaded
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

      // Store token in memory
      resetTokens.set(token, { userId: user._id.toString(), expiresAt, used: false });

      // Web reset page URL (served by this backend)
      const BASE_URL = process.env.BASE_URL || "http://localhost:5003";
      const resetLink = `${BASE_URL}/api/auth/reset-password/${token}`;
      await transporter.sendMail({
        from: `"Life Connect" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "🔑 Reset Your Life Connect Password",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f4f8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a,#3b82f6);padding:36px 40px;text-align:center;">
            <div style="width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,0.2);border:3px solid rgba(255,255,255,0.3);margin:0 auto 16px;display:table-cell;vertical-align:middle;text-align:center;">
              <span style="font-size:36px;font-weight:bold;color:#fff;">+</span>
            </div>
            <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;">Life Connect</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your Health, Connected</p>
          </td>
        </tr>
        <tr>
          <td style="padding:44px;">
            <h2 style="margin:0 0 12px;color:#1e293b;font-size:24px;font-weight:800;">Reset Your Password</h2>
            <p style="margin:0 0 28px;color:#64748b;font-size:15px;line-height:1.7;">
              Hi <strong style="color:#1e293b;">${user.fullName}</strong>,<br/><br/>
              We received a request to reset your Life Connect account password.
              Click the button below to create a new password.
            </p>
            <div style="text-align:center;margin:36px 0;">
              <a href="${resetLink}"
                 style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:18px 48px;border-radius:14px;font-size:16px;font-weight:700;box-shadow:0 6px 20px rgba(59,130,246,0.4);">
                🔐 Reset My Password
              </a>
            </div>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:24px;">
              <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                ⏱️ <strong>This link expires in 1 hour.</strong><br/>
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              If the button doesn't work, copy this link into your browser:<br/>
              <span style="color:#3b82f6;word-break:break-all;">${resetLink}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">🔒 This email was sent securely by Life Connect.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });

      console.log("✅ Reset email sent to:", user.email);
    }

    res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("❌ Forgot password error:", err.message);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// GET /api/auth/reset-password/:token
// Serves the reset password web page
router.get("/reset-password/:token", async (req, res) => {
  const { token } = req.params;

  const record = resetTokens.get(token);
  const expired = !record || record.used || Date.now() > record.expiresAt;

  if (expired) {
    return res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Link Expired - Life Connect</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #1e3a8a, #3b82f6); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #fff; border-radius: 24px; padding: 48px 40px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.2); }
    .icon { font-size: 56px; margin-bottom: 20px; }
    h2 { color: #1e293b; font-size: 24px; font-weight: 800; margin-bottom: 12px; }
    p { color: #64748b; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏰</div>
    <h2>Link Expired</h2>
    <p>This password reset link has expired or already been used.<br/><br/>Please go back to the login page and request a new reset link.</p>
  </div>
</body>
</html>`);
  }

  // Valid token — serve the reset form
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Reset Password - Life Connect</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }

    .card { background: #1a1d29; border-radius: 24px; padding: 44px 40px; max-width: 460px; width: 100%; box-shadow: 0 24px 60px rgba(0,0,0,0.4); }

    .logo { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 36px; }
    .logo-circle { width: 48px; height: 48px; border-radius: 50%; background: rgba(59,130,246,0.2); border: 2px solid rgba(59,130,246,0.4); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: bold; color: #3b82f6; }
    .logo-name { font-size: 22px; font-weight: 800; color: white; }

    .icon-wrap { width: 72px; height: 72px; border-radius: 50%; background: rgba(59,130,246,0.15); border: 2px solid rgba(59,130,246,0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; }

    h2 { text-align: center; color: white; font-size: 24px; font-weight: 800; margin-bottom: 8px; }
    .sub { text-align: center; color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 32px; }

    label { display: block; font-size: 11px; font-weight: 700; color: #cbd5e1; letter-spacing: 0.8px; margin-bottom: 8px; }

    .iw { position: relative; margin-bottom: 20px; }
    input[type=password], input[type=text] {
      width: 100%; padding: 15px 48px 15px 18px;
      background: #252936; border: 1px solid #2d3142;
      border-radius: 12px; font-size: 15px; color: white; outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #3b82f6; }

    .eye { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 18px; }

    .strength { display: flex; gap: 4px; margin-bottom: 6px; }
    .bar { flex: 1; height: 4px; border-radius: 2px; background: #2d3142; transition: background 0.3s; }
    .s-label { font-size: 11px; font-weight: 700; margin-bottom: 18px; }

    .match { font-size: 12px; font-weight: 600; margin-bottom: 16px; }

    .req-box { background: #252936; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px; border: 1px solid #2d3142; }
    .req { font-size: 12px; color: #64748b; margin-bottom: 5px; transition: color 0.2s; }
    .req.ok { color: #4ade80; }

    .btn { width: 100%; padding: 16px; background: #3b82f6; color: #fff; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 20px rgba(59,130,246,0.4); transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .err { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; padding: 13px 16px; color: #f87171; font-size: 13px; margin-bottom: 18px; display: none; }
    .success { text-align: center; display: none; }
    .success .s-icon { font-size: 56px; margin-bottom: 16px; }
    .success h3 { color: white; font-size: 22px; font-weight: 800; margin-bottom: 10px; }
    .success p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-circle">+</div>
    <span class="logo-name">Life Connect</span>
  </div>

  <div id="formSection">
    <div class="icon-wrap">🔐</div>
    <h2>Create New Password</h2>
    <p class="sub">Your new password must be different from your previous one.</p>

    <div class="err" id="errBox"></div>

    <label>NEW PASSWORD</label>
    <div class="iw">
      <input type="password" id="pw" placeholder="Enter new password" oninput="checkStrength()"/>
      <button class="eye" type="button" onclick="toggleEye('pw',this)">👁️</button>
    </div>

    <div class="strength">
      <div class="bar" id="b1"></div><div class="bar" id="b2"></div>
      <div class="bar" id="b3"></div><div class="bar" id="b4"></div>
      <div class="bar" id="b5"></div>
    </div>
    <div class="s-label" id="sLabel" style="color:#64748b"></div>

    <label>CONFIRM PASSWORD</label>
    <div class="iw">
      <input type="password" id="cf" placeholder="Confirm new password" oninput="checkMatch()"/>
      <button class="eye" type="button" onclick="toggleEye('cf',this)">👁️</button>
    </div>
    <div class="match" id="matchMsg"></div>

    <div class="req-box">
      <div class="req" id="r1">○  At least 6 characters</div>
      <div class="req" id="r2">○  Contains uppercase letter</div>
      <div class="req" id="r3">○  Contains a number</div>
    </div>

    <button class="btn" id="submitBtn" onclick="submitReset()">Reset Password</button>
  </div>

  <div class="success" id="successBox">
    <div class="s-icon">🎉</div>
    <h3>Password Reset!</h3>
    <p>Your password has been successfully updated.<br/><br/>You can now close this tab and sign in at <strong style="color:#3b82f6;">Life Connect</strong>.</p>
  </div>
</div>

<script>
  const TOKEN = '${token}';

  function toggleEye(id, btn) {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? '👁️' : '🙈';
  }

  function checkStrength() {
    const pw = document.getElementById('pw').value;
    const bars = ['b1','b2','b3','b4','b5'].map(id => document.getElementById(id));
    const lbl = document.getElementById('sLabel');

    const setReq = (id, ok, text) => {
      const el = document.getElementById(id);
      el.className = 'req' + (ok ? ' ok' : '');
      el.textContent = (ok ? '✓' : '○') + '  ' + text;
    };
    setReq('r1', pw.length >= 6, 'At least 6 characters');
    setReq('r2', /[A-Z]/.test(pw), 'Contains uppercase letter');
    setReq('r3', /\\d/.test(pw), 'Contains a number');

    if (!pw) { bars.forEach(b => b.style.background = '#2d3142'); lbl.textContent = ''; return; }
    const score = [pw.length >= 6, /[A-Z]/.test(pw), /[a-z]/.test(pw), /\\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
    const cfg = [null,
      { c: '#ef4444', l: 'Too short' }, { c: '#f97316', l: 'Weak' },
      { c: '#eab308', l: 'Fair' },      { c: '#22c55e', l: 'Good' },
      { c: '#16a34a', l: 'Strong' }
    ][Math.min(score, 5)];
    bars.forEach((b, i) => b.style.background = i < score ? cfg.c : '#2d3142');
    lbl.textContent = cfg.l; lbl.style.color = cfg.c;
    checkMatch();
  }

  function checkMatch() {
    const pw = document.getElementById('pw').value;
    const cf = document.getElementById('cf').value;
    const el = document.getElementById('matchMsg');
    if (!cf) { el.textContent = ''; return; }
    if (pw === cf) { el.textContent = '✓ Passwords match'; el.style.color = '#4ade80'; }
    else           { el.textContent = '✗ Passwords do not match'; el.style.color = '#f87171'; }
  }

  async function submitReset() {
    const pw = document.getElementById('pw').value;
    const cf = document.getElementById('cf').value;
    const err = document.getElementById('errBox');
    err.style.display = 'none';

    if (!pw || !cf)    { showErr('Please fill in both fields.'); return; }
    if (pw.length < 6) { showErr('Password must be at least 6 characters.'); return; }
    if (pw !== cf)     { showErr('Passwords do not match.'); return; }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.textContent = 'Resetting...';

    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, password: pw })
      });
      const d = await r.json();
      if (d.success) {
        document.getElementById('formSection').style.display = 'none';
        document.getElementById('successBox').style.display = 'block';
      } else {
        showErr(d.message || 'Reset failed.');
        btn.disabled = false; btn.textContent = 'Reset Password';
      }
    } catch(e) {
      showErr('Network error. Please try again.');
      btn.disabled = false; btn.textContent = 'Reset Password';
    }
  }

  function showErr(msg) {
    const el = document.getElementById('errBox');
    el.textContent = msg; el.style.display = 'block';
  }
</script>
</body>
</html>`);
});

// POST /api/auth/reset-password
// Actually updates the password
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  console.log("🔐 Reset password attempt");

  if (!token || !password) {
    return res.status(400).json({ success: false, message: "Token and password are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
  }

  const record = resetTokens.get(token);

  if (!record || record.used) {
    return res.status(400).json({ success: false, message: "Invalid or already used reset link." });
  }
  if (Date.now() > record.expiresAt) {
    resetTokens.delete(token);
    return res.status(400).json({ success: false, message: "Reset link has expired. Please request a new one." });
  }

  try {
    // Hash using SHA256 to match your existing login system
    const hashed = sha256(password);
    await User.findByIdAndUpdate(record.userId, {
      password: hashed,
      updatedAt: Date.now(),
    });

    // Mark token as used
    record.used = true;

    console.log("✅ Password reset for user:", record.userId);
    res.json({ success: true, message: "Password reset successfully." });
  } catch (err) {
    console.error("❌ Reset error:", err.message);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

export default router;