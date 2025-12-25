const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// @desc    Send a test email to verify SMTP configuration
// @route   POST /api/auth/email-test
// @access  Private
exports.emailTest = async (req, res) => {
  try {
    const to = (req.body && req.body.to) || req.user?.email;
    if (!to) return res.status(400).json({ message: 'Recipient email required' });
    const info = await sendTestEmail(to);
    return res.json({ ok: true, messageId: info?.messageId, response: info?.response });
  } catch (error) {
    const msg = (error && error.message) || 'Email test failed';
    return res.status(500).json({ ok: false, message: msg });
  }
};

// @desc    Resend verification email (and optionally expose token in dev)
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const normalized = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalized });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) {
      return res.status(200).json({ message: 'Account is already verified. Please log in.' });
    }

    user.verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    try {
      await sendVerificationEmail(user.email, user.verificationToken);
    } catch (emailError) {
      console.error('Failed to resend verification email:', emailError);
    }

    return res.status(200).json({
      message: 'Verification email resent. Please check your inbox.',
      ...(shouldExposeToken ? { devToken: user.verificationToken } : {}),
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Register a new user (sends verification email)
// @route   POST /api/auth/register
// @access  Public
const shouldExposeToken = process.env.NODE_ENV !== 'production' || process.env.EXPOSE_VERIFICATION_TOKEN === 'true';

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const first = errors.array()[0];
      return res.status(400).json({ message: first?.msg || 'Validation error', errors: errors.array() });
    }

    let { username, email, password } = req.body;
    username = String(username || '').trim();
    email = String(email || '').trim().toLowerCase();

    // Check if user already exists (by email)
    let user = await User.findOne({ email });
    if (user) {
      if (!user.isVerified) {
        // Regenerate verification token and resend email
        user.verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        try {
          await sendVerificationEmail(user.email, user.verificationToken);
        } catch (emailError) {
          console.error('Failed to resend verification email:', emailError);
        }

        return res.status(200).json({
          message: 'Account already created but not verified. We re-sent the verification email.',
          ...(shouldExposeToken ? { devToken: user.verificationToken } : {}),
        });
      }
      // If already verified, don't leak details or block UX
      return res.status(200).json({ message: 'Account already exists. Please log in.' });
    }

    // Ensure username is unique; if taken, auto-suggest a unique variant
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      const base = username.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
      let candidate = base;
      let attempts = 0;
      while (attempts < 20) {
        const suffix = Math.floor(Math.random() * 10000).toString();
        candidate = `${base}${suffix}`;
        // eslint-disable-next-line no-await-in-loop
        const clash = await User.findOne({ username: candidate });
        if (!clash) break;
        attempts += 1;
      }
      username = candidate;
    }

    // Create verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create new user
    user = new User({
      username,
      email,
      password,
      isVerified: false,
      verificationToken,
      verificationTokenExpires
    });

    await user.save();

    // Send verification email (fire-and-forget)
    try {
      await sendVerificationEmail(user.email, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    res.status(201).json({
      message: `Registration successful for @${username}. Please check your email to verify your account.`,
      ...(shouldExposeToken ? { devToken: verificationToken } : {}),
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error && error.code === 11000) {
      return res.status(400).json({ message: 'Email or username already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Verify user email
// @route   POST /api/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    // Find user by verification token and check expiry
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    await user.save();

    // Optionally, issue a JWT on successful verification
    const authToken = generateToken(user);

    res.json({
      message: 'Email verified successfully.',
      token: authToken,
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Login user (TEMPORARY: allows unverified users while waiting for Brevo activation)
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // TEMPORARY FIX: Auto-verify users while waiting for Brevo email service activation
    // TODO: Remove this section once Brevo account is activated by their support team
    // Email: contact@brevo.com to request activation
    if (!user.isVerified) {
      console.log('⚠️ TEMPORARY: Auto-verifying user during Brevo setup:', user.email);
      user.isVerified = true;
      await user.save();
    }
    // END TEMPORARY FIX - Delete the above 5 lines after Brevo is activated

    // Generate token
    const token = generateToken(user);

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};