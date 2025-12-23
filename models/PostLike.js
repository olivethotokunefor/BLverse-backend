const mongoose = require('mongoose');

const postLikeSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

postLikeSchema.index({ post: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('PostLike', postLikeSchema);
