const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const handlebars = require("handlebars");

// Create transporter (Gmail SMTP with App Password)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // use STARTTLS on 587
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
  logger: true,
  debug: true,
});

// Helper to load & compile template
const loadTemplate = (templateName, context) => {
  const filePath = path.join(__dirname, "../views/emails", `${templateName}.handlebars`);
  const source = fs.readFileSync(filePath, "utf8");
  const template = handlebars.compile(source);
  return template(context);
};

// Send verification email
exports.sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  const html = loadTemplate("verification", {
    verificationUrl,
    year: new Date().getFullYear(),
  });

  const mailOptions = {
    from: `"BLverse" <${process.env.EMAIL_FROM || process.env.EMAIL_USERNAME}>`,
    to: email,
    subject: "Verify Your Email Address",
    html,
  };

  try {
    // verify connection configuration for clearer errors
    await transporter.verify();
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Email error:", error);
    return false;
  }
};

// Simple test email to diagnose SMTP in production
exports.sendTestEmail = async (to) => {
  const mailOptions = {
    from: `"BLverse" <${process.env.EMAIL_FROM || process.env.EMAIL_USERNAME}>`,
    to,
    subject: "BLverse Email Test",
    text: "This is a test email from BLverse backend.",
    html: "<p>This is a <strong>test</strong> email from BLverse backend.</p>",
  };

  await transporter.verify();
  const info = await transporter.sendMail(mailOptions);
  return info;
};

// Send password reset email
exports.sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

  const html = loadTemplate("passwordReset", {
    resetUrl,
    year: new Date().getFullYear(),
  });

  const mailOptions = {
    from: `"BLverse" <${process.env.EMAIL_FROM || process.env.EMAIL_USERNAME}>`,
    to: email,
    subject: "Password Reset Request",
    html,
  };

  try {
    await transporter.verify();
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Email error:", error);
    return false;
  }
};
