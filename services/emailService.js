const brevo = require('@getbrevo/brevo');

// Initialize Brevo API instance with error handling
let apiInstance = null;

try {
  if (!process.env.BREVO_API_KEY) {
    console.warn('⚠️ WARNING: BREVO_API_KEY not set. Email functionality disabled.');
  } else {
    apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );
    console.log('✅ Brevo email service initialized');
  }
} catch (error) {
  console.error('❌ Failed to initialize Brevo:', error.message);
}

async function sendEmail({ to, subject, html, text }) {
  if (!apiInstance) {
    console.error('❌ Email service not initialized. Check BREVO_API_KEY.');
    throw new Error('Email service not available');
  }

  try {
    const sendSmtpEmail = {
      sender: { 
        email: process.env.EMAIL_FROM || 'noreply@blverse.com',
        name: 'BLverse' 
      },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html,
      textContent: text || undefined
    };

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('✅ Email sent successfully to:', to);
    return result;
  } catch (error) {
    console.error('❌ Brevo email error:', error);
    throw error;
  }
}

// Send verification email
async function sendVerificationEmail(email, verificationToken) {
  const verificationLink = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
  
  return sendEmail({
    to: email,
    subject: 'Verify Your BLverse Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to BLverse!</h2>
        <p>Please verify your email address by clicking the button below:</p>
        <a href="${verificationLink}" 
           style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; 
                  color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
          Verify Email
        </a>
        <p>Or copy and paste this link:</p>
        <p style="color: #666; word-break: break-all;">${verificationLink}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          If you didn't create this account, you can safely ignore this email.
        </p>
      </div>
    `
  });
}

// Send password reset email
async function sendPasswordResetEmail(email, resetToken) {
  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  
  return sendEmail({
    to: email,
    subject: 'Reset Your BLverse Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the button below to proceed:</p>
        <a href="${resetLink}" 
           style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; 
                  color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
          Reset Password
        </a>
        <p>Or copy and paste this link:</p>
        <p style="color: #666; word-break: break-all;">${resetLink}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          This link will expire in 1 hour. If you didn't request this, please ignore this email.
        </p>
      </div>
    `
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail
};