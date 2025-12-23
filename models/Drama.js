const mongoose = require('mongoose');

const dramaSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String },
    tmdbId: { type: String },
    genres: { type: [String], default: [] },
    year: { type: Number },
    rating: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.model('Drama', dramaSchema);
