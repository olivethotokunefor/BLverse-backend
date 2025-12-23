const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { registerValidator, loginValidator } = require('../middleware/validators');
const { register, login, getMe, verifyEmail, resendVerification } = require('../controllers/authController');

// Public routes
router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);

// Protected routes
router.get('/me', protect, getMe);

module.exports = router;
