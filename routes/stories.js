const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getStories,
  getStoriesFeed,
  createStory,
  toggleLike,
  toggleFavorite,
  updateStory,
  deleteStory,
  getComments,
  createComment,
  updateComment,
  deleteComment,
  getReplies,
  createReply,
} = require('../controllers/storyController');

router.use(protect);

router.route('/')
  .get(getStories)
  .post(createStory);

router.get('/feed', getStoriesFeed);
router.post('/:storyId/likes/toggle', toggleLike);
router.post('/:storyId/favorites/toggle', toggleFavorite);
router.patch('/:storyId', updateStory);
router.delete('/:storyId', deleteStory);

router.get('/:storyId/comments', getComments);
router.post('/:storyId/comments', createComment);
router.patch('/comments/:commentId', updateComment);
router.delete('/comments/:commentId', deleteComment);
router.get('/comments/:commentId/replies', getReplies);
router.post('/comments/:commentId/replies', createReply);

module.exports = router;
