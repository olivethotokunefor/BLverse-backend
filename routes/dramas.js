const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getDramas, getDramaById } = require('../controllers/dramaController');

router.use(protect);

router.route('/')
  .get(getDramas);

router.route('/:id')
  .get(getDramaById);

module.exports = router;
