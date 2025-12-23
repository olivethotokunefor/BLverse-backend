const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getShips, voteShip } = require('../controllers/shipController');

router.use(protect);

router.route('/')
  .get(getShips);

router.route('/:id/vote')
  .post(voteShip);

module.exports = router;
