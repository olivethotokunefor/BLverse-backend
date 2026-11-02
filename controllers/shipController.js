const Ship = require('../models/Ship');

// @desc    Get ships sorted by votes
// @route   GET /api/ships
// @access  Private
exports.getShips = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const userId = req.user && req.user.id;

    const ships = await Ship.find().sort({ votesCount: -1 }).limit(limit).lean();

    // Annotate each ship with whether the current user has voted
    const items = ships.map((s) => ({
      _id: s._id,
      name: s.name,
      description: s.description,
      imageUrl: s.imageUrl,
      votesCount: s.votesCount,
      votedByMe: userId
        ? (s.voters || []).some((v) => String(v) === String(userId))
        : false,
    }));

    res.json(items);
  } catch (error) {
    console.error('Get ships error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Toggle vote for a ship (vote / un-vote)
// @route   POST /api/ships/:id/vote
// @access  Private
exports.voteShip = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const ship = await Ship.findById(id);
    if (!ship) {
      return res.status(404).json({ message: 'Ship not found' });
    }

    const alreadyVoted = ship.voters.some((v) => String(v) === String(userId));

    if (alreadyVoted) {
      // Un-vote
      ship.voters = ship.voters.filter((v) => String(v) !== String(userId));
      ship.votesCount = Math.max(0, ship.votesCount - 1);
    } else {
      // Vote
      ship.voters.push(userId);
      ship.votesCount += 1;
    }

    await ship.save();

    res.json({
      _id: ship._id,
      name: ship.name,
      description: ship.description,
      imageUrl: ship.imageUrl,
      votesCount: ship.votesCount,
      votedByMe: !alreadyVoted,
    });
  } catch (error) {
    console.error('Vote ship error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
