const MerchItem = require('../models/MerchItem');

// @desc    Get merch items
// @route   GET /api/merch
// @access  Private
exports.getMerch = async (req, res) => {
  try {
    const { type } = req.query;

    const filter = {};
    if (type && type !== 'all') {
      filter.type = type;
    }

    const items = await MerchItem.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    console.error('Get merch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
