const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upsertProgress, getMyProgressForWork, listCurrentlyReading } = require('../controllers/readingProgressController');

router.post('/', protect, upsertProgress);
router.get('/currently-reading', protect, listCurrentlyReading);
router.get('/:workId', protect, getMyProgressForWork);

module.exports = router;
