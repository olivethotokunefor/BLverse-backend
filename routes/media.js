const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { uploadMedia, cloudinaryTest } = require('../controllers/mediaController');

const router = express.Router();

// Use memoryStorage so we can stream directly to Cloudinary
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/media/upload  (auth optional; change to router.use(protect) if needed)
router.post('/upload', protect, upload.single('file'), uploadMedia);

// GET /api/media/cloudinary-test - verify Cloudinary connectivity
router.get('/cloudinary-test', cloudinaryTest);

module.exports = router;
