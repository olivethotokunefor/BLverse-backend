const mongoose = require('mongoose');

const postCommentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'PostComment', default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

postCommentSchema.index({ post: 1, parent: 1, createdAt: 1 });

module.exports = mongoose.model('PostComment', postCommentSchema);
