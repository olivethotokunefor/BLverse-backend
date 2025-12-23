const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'comment', 'reply', 'mention', 'profile_view', 'kudos'], required: true },
    entityType: { type: String, enum: ['community_post', 'community_comment', 'profile', 'story', 'story_comment', 'work', 'work_comment'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    url: { type: String, default: '' },
    readAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, actor: 1, type: 1, entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
