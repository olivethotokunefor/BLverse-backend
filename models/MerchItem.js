const mongoose = require('mongoose');

const merchItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String },
    link: { type: String },
    type: { type: String, default: 'merchandise' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.model('MerchItem', merchItemSchema);
