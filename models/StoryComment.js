const mongoose = require('mongoose');

const storyCommentSchema = new mongoose.Schema(
  {
    story: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'StoryComment', default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.model('StoryComment', storyCommentSchema);
