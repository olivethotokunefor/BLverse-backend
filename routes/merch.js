const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getMerch } = require('../controllers/merchController');

router.use(protect);
router.get('/', getMerch);

module.exports = router;
