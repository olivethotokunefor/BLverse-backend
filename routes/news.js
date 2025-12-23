const express = require('express');
const router = express.Router();
const { scrapeNews, proxyImage } = require('../controllers/newsController');
const calendarRouter = require('./calendar');

// GET /api/news
router.get('/', scrapeNews);

// GET /api/news/image?url=https%3A%2F%2F...
router.get('/image', proxyImage);

// Mount BL calendar under /api/news/calendar
router.use('/calendar', calendarRouter);

module.exports = router;
