const Drama = require('../models/Drama');

// @desc    Get dramas
// @route   GET /api/dramas
// @access  Private
exports.getDramas = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const dramas = await Drama.find().sort({ createdAt: -1 }).limit(limit);
    res.json(dramas);
  } catch (error) {
    console.error('Get dramas error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get drama by ID (Mongo _id or tmdbId)
// @route   GET /api/dramas/:id
// @access  Private
exports.getDramaById = async (req, res) => {
  try {
    const { id } = req.params;

    let drama = null;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      drama = await Drama.findById(id);
    }

    if (!drama) {
      drama = await Drama.findOne({ tmdbId: id });
    }

    if (!drama) {
      return res.status(404).json({ message: 'Drama not found' });
    }

    res.json(drama);
  } catch (error) {
    console.error('Get drama by id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
