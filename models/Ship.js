const mongoose = require('mongoose');

const shipSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String },
    votesCount: { type: Number, default: 0 },
    // Track who voted so we can deduplicate votes and support un-voting
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// Fast lookup: has this user voted on this ship?
shipSchema.index({ voters: 1 });

module.exports = mongoose.model('Ship', shipSchema);
