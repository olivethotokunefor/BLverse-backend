const brevo = require('@getbrevo/brevo');

// Initialize Brevo API instance
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

// Base email sending function
async function sendEmail({ to, subject, html, text }) {
  try {
    const sendSmtpEmail = {
      sender: { 
        email: process.env.EMAIL_FROM || 'noreply@blverse.com', // Replace with your verified email
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
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  
  return sendEmail({
    to: email,
    subject: 'Verify Your BLverse Email',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 40px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to BLverse! 🎉</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0;">Verify Your Email Address</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Thank you for joining BLverse! We're excited to have you as part of our community.
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Please verify your email address by clicking the button below:
            </p>
            
            <!-- Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" 
                 style="display: inline-block; padding: 14px 32px; background-color: #667eea; 
                        color: white; text-decoration: none; border-radius: 6px; font-weight: bold;
                        font-size: 16px;">
                Verify Email Address
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Or copy and paste this link into your browser:
            </p>
            <p style="color: #667eea; font-size: 13px; word-break: break-all; background-color: #f8f9fa; padding: 12px; border-radius: 4px;">
              ${verificationLink}
            </p>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              ⏰ This link will expire in 24 hours.<br>
              If you didn't create a BLverse account, you can safely ignore this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Welcome to BLverse!\n\nPlease verify your email address by clicking this link:\n${verificationLink}\n\nThis link will expire in 24 hours.\n\nIf you didn't create this account, you can safely ignore this email.`
  });
}

// Send password reset email
async function sendPasswordResetEmail(email, resetToken) {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  return sendEmail({
    to: email,
    subject: 'Reset Your BLverse Password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 40px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset Request 🔐</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              We received a request to reset your BLverse password. Click the button below to create a new password:
            </p>
            
            <!-- Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="display: inline-block; padding: 14px 32px; background-color: #f5576c; 
                        color: white; text-decoration: none; border-radius: 6px; font-weight: bold;
                        font-size: 16px;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Or copy and paste this link into your browser:
            </p>
            <p style="color: #f5576c; font-size: 13px; word-break: break-all; background-color: #f8f9fa; padding: 12px; border-radius: 4px;">
              ${resetLink}
            </p>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0; border-radius: 4px;">
              <p style="color: #856404; margin: 0; font-size: 14px;">
                ⚠️ <strong>Security Notice:</strong> This link will expire in 1 hour.
              </p>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              If you didn't request a password reset, please ignore this email or contact support if you're concerned about your account security.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Password Reset Request\n\nWe received a request to reset your BLverse password.\n\nClick this link to reset your password:\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`
  });
}

// Test email function (optional - for debugging)
async function sendTestEmail(to) {
  return sendEmail({
    to: to,
    subject: 'BLverse Email Test',
    html: '<p>This is a test email from BLverse. If you received this, your email service is working correctly! ✅</p>',
    text: 'This is a test email from BLverse. If you received this, your email service is working correctly!'
  });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTestEmail
};