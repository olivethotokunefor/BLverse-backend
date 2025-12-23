const mongoose = require('mongoose');

const workCommentLikeSchema = new mongoose.Schema(
  {
    comment: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkComment', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

workCommentLikeSchema.index({ comment: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('WorkCommentLike', workCommentLikeSchema);
