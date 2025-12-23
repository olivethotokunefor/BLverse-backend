const mongoose = require('mongoose');

const storyFavoriteSchema = new mongoose.Schema(
  {
    story: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

storyFavoriteSchema.index({ story: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('StoryFavorite', storyFavoriteSchema);
