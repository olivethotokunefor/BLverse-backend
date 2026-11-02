const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { shipVote } = require('../middleware/rateLimiter');
const { getShips, voteShip } = require('../controllers/shipController');

router.use(protect);

router.route('/').get(getShips);

// Rate-limited voting — prevents vote inflation scripts
router.route('/:id/vote').post(shipVote, voteShip);

module.exports = router;
