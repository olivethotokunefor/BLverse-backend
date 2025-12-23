const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getPosts,
  createPost,
  toggleLike,
  getComments,
  createComment,
  updatePost,
  deletePost,
  updateComment,
  deleteComment,
  attachPostImage,
  stream,
  getFeed,
  getReplies,
  createReply,
  toggleCommentLike,
} = require('../controllers/communityController');
const communityController = require('../controllers/communityController');
const multer = require('multer');
const path = require('path');

// Multer setup for image uploads: use memory storage so we can upload to Cloudinary/GridFS
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// Server-Sent Events stream for realtime updates (no auth for now)
router.get('/stream', stream);

// Public feed (view-only): allow unauthenticated users to read posts
router.get('/feed', getFeed);
// Public: single post lookup for deep linking and previews
router.get('/posts/:postId', (req, res, next) => {
  const fn = communityController.getPost;
  if (typeof fn === 'function') return fn(req, res, next);
  return res.status(501).json({ message: 'getPost not available' });
});

// Public: view comments without auth
router.get('/posts/:postId/comments', getComments);
// Public: lookup single comment metadata (post/parent) for deep linking
router.get('/comments/:commentId', (req, res, next) => {
  const fn = communityController.getCommentById;
  if (typeof fn === 'function') return fn(req, res, next);
  return res.status(501).json({ message: 'getCommentById not available' });
});

router.use(protect);

router.route('/posts')
  .get(getPosts)
  .post(createPost);

router.post('/posts/:postId/likes/toggle', toggleLike);

// Comments: expose GET publicly (move above protect) and POST under auth.
// Note: GET is already defined publicly below.
router.route('/posts/:postId/comments')
  .post(createComment);

// Edit/Delete posts
router.patch('/posts/:postId', updatePost);
router.delete('/posts/:postId', deletePost);

// Edit/Delete comments
router.patch('/comments/:commentId', updateComment);
router.delete('/comments/:commentId', deleteComment);

// Attach image to a post
router.post('/posts/:postId/image', upload.single('image'), attachPostImage);

// Replies for comments
router.get('/comments/:commentId/replies', getReplies);
router.post('/comments/:commentId/replies', createReply);

// Comment/Reply likes
router.post('/comments/:commentId/likes/toggle', (req, res, next) => {
  const fn = communityController.toggleCommentLike;
  if (typeof fn === 'function') return fn(req, res, next);
  return res.status(501).json({ message: 'toggleCommentLike not available' });
});

module.exports = router;
