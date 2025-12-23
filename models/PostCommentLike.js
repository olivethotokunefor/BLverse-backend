const mongoose = require('mongoose');

const postCommentLikeSchema = new mongoose.Schema(
  {
    comment: { type: mongoose.Schema.Types.ObjectId, ref: 'PostComment', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

postCommentLikeSchema.index({ comment: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('PostCommentLike', postCommentLikeSchema);
