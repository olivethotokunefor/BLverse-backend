const mongoose = require('mongoose');

const workChapterSchema = new mongoose.Schema(
  {
    work: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true, index: true },
    number: { type: Number, required: true },
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    words: { type: Number, default: 0, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

workChapterSchema.index({ work: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('WorkChapter', workChapterSchema);
