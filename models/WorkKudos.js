const mongoose = require('mongoose');

const workKudosSchema = new mongoose.Schema(
  {
    work: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

workKudosSchema.index({ work: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('WorkKudos', workKudosSchema);
