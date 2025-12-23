const mongoose = require('mongoose');

const readingProgressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    work: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true },
    lastChapterNumber: { type: Number, required: true, min: 1 },
    pct: { type: Number, default: 0, min: 0, max: 1 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

readingProgressSchema.index({ user: 1, work: 1 }, { unique: true });
readingProgressSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model('ReadingProgress', readingProgressSchema);
