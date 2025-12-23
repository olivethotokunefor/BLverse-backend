const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getSession, appendMessage, clearSession } = require('../controllers/aiChatController');

router.use(protect);

router.get('/', getSession);
router.post('/messages', appendMessage);
router.delete('/', clearSession);

module.exports = router;
