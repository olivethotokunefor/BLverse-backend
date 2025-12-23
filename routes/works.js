const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { listWorks, getWork, getChapter, giveKudos, toggleBookmark, createWork, addChapter, facets, uploadCover, listChapters, getEntireWork, updateWork, deleteWork, updateChapter, deleteChapter, recordHit } = require('../controllers/worksController');
const { listChapterComments, createChapterComment, toggleWorkCommentLike, updateWorkComment, deleteWorkComment } = require('../controllers/workCommentsController');

const upload = multer({ dest: path.resolve(__dirname, '..', 'uploads') });

// Public browsing
router.get('/facets', facets);
router.get('/', listWorks);
router.get('/:workId', getWork);
// More specific chapter routes must come before the numeric route
router.get('/:workId/chapters', listChapters);
router.get('/:workId/chapters/all', getEntireWork);
router.get('/:workId/chapters/:number', getChapter);

// Work comments (chapter-level). Listing is public, posting requires auth.
router.get('/:workId/chapters/:number/comments', listChapterComments);
router.post('/:workId/chapters/:number/comments', protect, createChapterComment);
router.post('/comments/:commentId/likes/toggle', protect, toggleWorkCommentLike);
router.put('/comments/:commentId', protect, updateWorkComment);
router.delete('/comments/:commentId', protect, deleteWorkComment);
router.post('/:workId/hit', recordHit);

// Auth required actions
router.post('/', protect, createWork);
router.post('/:workId/chapters', protect, addChapter);
router.post('/:workId/kudos', protect, giveKudos);
router.post('/:workId/bookmarks/toggle', protect, toggleBookmark);
router.post('/cover/upload', protect, upload.single('cover'), uploadCover);

// Author-only modifications
router.put('/:workId', protect, updateWork);
router.delete('/:workId', protect, deleteWork);
router.put('/:workId/chapters/:number', protect, updateChapter);
router.delete('/:workId/chapters/:number', protect, deleteChapter);

module.exports = router;
