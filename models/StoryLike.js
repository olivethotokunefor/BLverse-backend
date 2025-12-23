const mongoose = require('mongoose');

const storyLikeSchema = new mongoose.Schema(
  {
    story: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

storyLikeSchema.index({ story: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('StoryLike', storyLikeSchema);
