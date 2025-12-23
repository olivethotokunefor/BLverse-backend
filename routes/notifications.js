const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { list, unreadCount, markRead, markAllRead } = require('../controllers/notificationsController');

router.use(protect);

router.get('/', list);
router.get('/unread-count', unreadCount);
router.post('/read', markRead);
router.post('/read-all', markAllRead);

module.exports = router;
