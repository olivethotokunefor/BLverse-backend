const mongoose = require('mongoose');

const workBookmarkSchema = new mongoose.Schema(
  {
    work: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    private: { type: Boolean, default: true },
  },
  { timestamps: true }
);

workBookmarkSchema.index({ work: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('WorkBookmark', workBookmarkSchema);
