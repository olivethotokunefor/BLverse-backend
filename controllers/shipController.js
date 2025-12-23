const Ship = require('../models/Ship');

// @desc    Get ships
// @route   GET /api/ships
// @access  Private
exports.getShips = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const ships = await Ship.find().sort({ votesCount: -1 }).limit(limit);
    res.json(ships);
  } catch (error) {
    console.error('Get ships error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Vote for a ship
// @route   POST /api/ships/:id/vote
// @access  Private
exports.voteShip = async (req, res) => {
  try {
    const { id } = req.params;
    const ship = await Ship.findById(id);

    if (!ship) {
      return res.status(404).json({ message: 'Ship not found' });
    }

    ship.votesCount += 1;
    await ship.save();

    res.json(ship);
  } catch (error) {
    console.error('Vote ship error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
