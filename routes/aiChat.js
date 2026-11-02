const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { aiChat } = require('../middleware/rateLimiter');
const { getSession, appendMessage, clearSession } = require('../controllers/aiChatController');

router.use(protect);

router.get('/', getSession);
router.post('/messages', aiChat, appendMessage); // Rate-limited — Gemini calls are expensive
router.delete('/', clearSession);

module.exports = router;
