const mongoose = require('mongoose');

const workCommentSchema = new mongoose.Schema(
  {
    work: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true, index: true },
    chapterNumber: { type: Number, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkComment', default: null, index: true },
    content: { type: String, required: true },
    likesCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

workCommentSchema.index({ work: 1, chapterNumber: 1, createdAt: 1 });

module.exports = mongoose.model('WorkComment', workCommentSchema);
