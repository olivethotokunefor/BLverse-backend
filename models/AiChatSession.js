const mongoose = require('mongoose');

const aiChatMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '' },
    results: {
      type: [
        {
          id: { type: Number, required: true },
          name: { type: String, default: '' },
          original_name: { type: String, default: '' },
          poster_path: { type: String, default: '' },
          first_air_date: { type: String, default: '' },
        },
      ],
      default: undefined,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const aiChatSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    messages: { type: [aiChatMessageSchema], default: [] },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

aiChatSessionSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model('AiChatSession', aiChatSessionSchema);
