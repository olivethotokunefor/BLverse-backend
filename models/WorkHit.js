const mongoose = require('mongoose');

const WorkHitSchema = new mongoose.Schema(
  {
    work: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    anonId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Ensure uniqueness per (work,user) when user is present
WorkHitSchema.index(
  { work: 1, user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } }
);

// Ensure uniqueness per (work,anonId) when anonId is present
WorkHitSchema.index(
  { work: 1, anonId: 1 },
  { unique: true, partialFilterExpression: { anonId: { $type: 'string' } } }
);

module.exports = mongoose.model('WorkHit', WorkHitSchema);
