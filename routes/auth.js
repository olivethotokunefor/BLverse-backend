const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authStrict, authModerate } = require('../middleware/rateLimiter');
const { registerValidator, loginValidator } = require('../middleware/validators');
const { register, login, getMe, verifyEmail, resendVerification, emailTest } = require('../controllers/authController');

// Public routes — rate-limited
router.post('/register', authStrict, registerValidator, register);
router.post('/login', authStrict, loginValidator, login);
router.post('/verify-email', authModerate, verifyEmail);
router.post('/resend-verification', authModerate, resendVerification);

// Protected routes
router.get('/me', protect, getMe);
router.post('/email-test', protect, emailTest);

module.exports = router;
