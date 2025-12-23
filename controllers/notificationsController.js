const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');

function toIso(d) {
  try {
    return d ? new Date(d).toISOString() : null;
  } catch {
    return null;
  }
}

function mapNotification(n) {
  return {
    id: String(n._id),
    recipient: String(n.recipient),
    actor: n.actor && typeof n.actor === 'object' ? {
      _id: String(n.actor._id),
      username: n.actor.username,
      profile: n.actor.profile || {},
    } : { _id: String(n.actor) },
    type: n.type,
    entityType: n.entityType,
    entityId: String(n.entityId),
    url: n.url || '',
    meta: n.meta || undefined,
    readAt: n.readAt ? toIso(n.readAt) : null,
    createdAt: toIso(n.createdAt),
  };
}

exports.list = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const q = { recipient: req.user.id };
    if (before) q.createdAt = { $lt: before };

    const items = await Notification.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'username profile')
      .lean();

    res.json({ items: items.map(mapNotification) });
  } catch (e) {
    console.error('notifications.list error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.unreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user.id, readAt: null });
    res.json({ unread: count });
  } catch (e) {
    console.error('notifications.unreadCount error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const objectIds = ids
      .map((id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null))
      .filter(Boolean);

    if (!objectIds.length) return res.json({ ok: true });

    await Notification.updateMany(
      { _id: { $in: objectIds }, recipient: req.user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('notifications.markRead error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('notifications.markAllRead error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.trackProfileView = async (req, res) => {
  try {
    const targetId = req.params.id;
    if (!mongoose.isValidObjectId(targetId)) return res.status(400).json({ message: 'Invalid user id' });
    if (String(targetId) === String(req.user.id)) return res.json({ ok: true, ignored: true });

    const target = await User.findById(targetId).select('_id username');
    if (!target) return res.status(404).json({ message: 'User not found' });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await Notification.findOne({
      recipient: targetId,
      actor: req.user.id,
      type: 'profile_view',
      entityType: 'profile',
      entityId: targetId,
      createdAt: { $gte: since },
    }).select('_id');

    if (!recent) {
      await Notification.create({
        recipient: targetId,
        actor: req.user.id,
        type: 'profile_view',
        entityType: 'profile',
        entityId: targetId,
        url: `/profile/${String(req.user.id)}`,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('notifications.trackProfileView error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createMentionNotifications = async ({ actorId, entityType, entityId, url, text }) => {
  const content = typeof text === 'string' ? text : '';
  if (!content.trim()) return;

  const regex = /(?:^|\s)@([a-zA-Z0-9_]{3,20})\b/g;
  const usernames = new Set();
  let m;
  while ((m = regex.exec(content)) !== null) {
    if (m[1]) usernames.add(m[1]);
  }
  if (!usernames.size) return;

  const list = Array.from(usernames);
  const users = await User.find({ username: { $in: list } }).select('_id username').lean();

  const notifs = users
    .filter((u) => String(u._id) !== String(actorId))
    .slice(0, 10)
    .map((u) => ({
      recipient: u._id,
      actor: actorId,
      type: 'mention',
      entityType,
      entityId,
      url,
      meta: { username: u.username },
    }));

  if (notifs.length) {
    await Notification.insertMany(notifs, { ordered: false }).catch(() => {});
  }
};

exports.createNotification = async ({ recipientId, actorId, type, entityType, entityId, url, meta }) => {
  if (!recipientId || !actorId) return;
  if (String(recipientId) === String(actorId)) return;
  await Notification.create({
    recipient: recipientId,
    actor: actorId,
    type,
    entityType,
    entityId,
    url: url || '',
    meta: meta || undefined,
  });
};
