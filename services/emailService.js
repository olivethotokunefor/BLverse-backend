// backend/services/emailService.js
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const handlebars = require("handlebars");

// Load & compile a handlebars template from views/emails
const loadTemplate = (templateName, context) => {
  const filePath = path.join(__dirname, "../views/emails", `${templateName}.handlebars`);
  const source = fs.readFileSync(filePath, "utf8");
  const template = handlebars.compile(source);
  return template(context);
};

// Decide provider: use Resend when RESEND_API_KEY is present (or EMAIL_PROVIDER=resend), else Gmail SMTP
const shouldUseResend = !!process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER === "resend";

// Lazily create Gmail SMTP transporter (STARTTLS 587)
function createSmtpTransporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS
    requireTLS: true,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD, // Gmail App Password
    },
    logger: true,
    debug: true,
  });
}

async function sendViaResend({ to, subject, html, text }) {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME;
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  if (!from) throw new Error("EMAIL_FROM or EMAIL_USERNAME must be set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Resend API failed with ${res.status}`;
    const err = new Error(msg);
    err.response = data;
    throw err;
  }
  return data;
}

async function sendViaSMTP({ to, subject, html, text }) {
  const transporter = createSmtpTransporter();
  const mailOptions = {
    from: `"BLverse" <${process.env.EMAIL_FROM || process.env.EMAIL_USERNAME}>`,
    to,
    subject,
    html,
    text,
  };
  await transporter.verify();
  return transporter.sendMail(mailOptions);
}

async function sendMailGeneric({ to, subject, html, text }) {
  if (shouldUseResend) return sendViaResend({ to, subject, html, text });
  return sendViaSMTP({ to, subject, html, text });
}

// Send verification email
exports.sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  const html = loadTemplate("verification", {
    verificationUrl,
    year: new Date().getFullYear(),
  });

  try {
    await sendMailGeneric({
      to: email,
      subject: "Verify Your Email Address",
      html,
      text: `Verify your email by visiting: ${verificationUrl}`,
    });
    return true;
  } catch (error) {
    console.error("Email error:", error);
    return false;
  }
};

// Simple test email to diagnose email provider in production
exports.sendTestEmail = async (to) => {
  const info = await sendMailGeneric({
    to,
    subject: "BLverse Email Test",
    text: "This is a test email from BLverse backend.",
    html: "<p>This is a <strong>test</strong> email from BLverse backend.</p>",
  });
  return info;
};

// Send password reset email
exports.sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

  const html = loadTemplate("passwordReset", {
    resetUrl,
    year: new Date().getFullYear(),
  });

  try {
    await sendMailGeneric({
      to: email,
      subject: "Password Reset Request",
      html,
      text: `Reset your password by visiting: ${resetUrl}`,
    });
    return true;
  } catch (error) {
    console.error("Email error:", error);
    return false;
  }
};