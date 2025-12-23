const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const {
  stream,
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendText,
  sendMedia,
  markRead,
  typing,
  markDelivered,
  reactMessage,
  unreactMessage,
  deleteMessage,
  searchMessages,
  editMessage,
} = require('../controllers/messagesController');

// SSE stream (token via query param)
router.get('/stream', stream);

// Multer for media uploads (images and audio)
// Use memory storage so we can persist files to MongoDB GridFS
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/ogg', 'audio/wav'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported file type'));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });

const { getMedia } = require('../controllers/messagesController');

// Public media fetch (GridFS stream)
router.get('/media/:id', getMedia);

// Authenticated routes
router.use(protect);

router.get('/conversations', getConversations);
router.post('/conversations/:otherUserId', getOrCreateConversation);
router.get('/:conversationId', getMessages);
router.post('/:otherUserId/text', sendText);
router.post('/:otherUserId/media', upload.single('file'), sendMedia);
router.post('/:conversationId/read', markRead);
router.post('/typing/:otherUserId', typing);
router.post('/:conversationId/delivered', markDelivered);
router.post('/reactions/:messageId', reactMessage);
router.delete('/reactions/:messageId', unreactMessage);
router.delete('/:messageId', deleteMessage);
router.get('/:conversationId/search', searchMessages);
router.patch('/:messageId', editMessage);

module.exports = router;
