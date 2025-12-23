const mongoose = require('mongoose');

const workSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    coverImage: { type: String, default: '' },
    summary: { type: String, default: '' },
    rating: { type: String, enum: ['general', 'teen', 'mature', 'explicit', 'notrated'], index: true },
    warnings: { type: [String], default: [] },
    fandoms: { type: [String], default: [], index: true },
    relationships: { type: [String], default: [], index: true },
    characters: { type: [String], default: [], index: true },
    tags: { type: [String], default: [], index: true },
    language: { type: String, default: 'English', index: true },
    completionStatus: { type: String, enum: ['complete', 'in_progress'], default: 'in_progress', index: true },

    words: { type: Number, default: 0, index: true },
    chaptersCount: { type: Number, default: 0 },
    chaptersTotal: { type: Number, default: 0 }, // e.g., 10 in "3/10"

    kudosCount: { type: Number, default: 0, index: true },
    bookmarksCount: { type: Number, default: 0, index: true },
    hitsCount: { type: Number, default: 0, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

workSchema.index({ updatedAt: -1 });
workSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Work', workSchema);
