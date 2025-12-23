const jwt = require('jsonwebtoken');
const path = require('path');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary if env provided
try {
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
} catch {}

function uploadBufferToCloudinary(buffer, filename, mimetype) {
  return new Promise((resolve, reject) => {
    const folder = process.env.CLOUDINARY_FOLDER || 'blverse/messages';
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', public_id: filename.replace(/[^a-z0-9-_]/gi, '_') },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { getIO } = require('../realtime/io');

// In-memory SSE clients keyed by userId
const messageClients = new Map(); // userId -> Set<res>

function addClient(userId, res) {
  if (!messageClients.has(userId)) messageClients.set(userId, new Set());
  messageClients.get(userId).add(res);
}
function removeClient(userId, res) {
  const set = messageClients.get(userId);
  if (set) {
    set.delete(res);
    if (set.size === 0) messageClients.delete(userId);
  }
}
function notifyUsers(userIds, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const uid of userIds) {
    const set = messageClients.get(String(uid));
    if (set) {
      for (const res of set) {
        try { res.write(payload); } catch (_) {}
      }
    }
  }
}

// GET /api/messages/stream?token=...
exports.stream = (req, res) => {
  try {
    const token = req.query.token || '';
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = String(decoded.id);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, userId })}\n\n`);

    addClient(userId, res);
    req.on('close', () => removeClient(userId, res));
  } catch (e) {
    res.status(401).end();
  }
};

// ----- GridFS helpers -----
let gridBucket = null;
function getGridBucket() {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) throw new Error('DB not ready');
  if (!gridBucket) {
    gridBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'media' });
  }
  return gridBucket;
}

async function saveBufferToGridFS(filename, contentType, buffer) {
  const bucket = getGridBucket();
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, { contentType });
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

// GET /api/messages/media/:id
exports.getMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const bucket = getGridBucket();
    const _id = new mongoose.Types.ObjectId(id);
    const files = await bucket.find({ _id }).toArray();
    if (!files || files.length === 0) return res.status(404).json({ message: 'Not found' });
    const file = files[0];
    if (file.contentType) res.setHeader('Content-Type', file.contentType);
    if (req.query.download === '1') {
      const safeName = (file.filename || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    const stream = bucket.openDownloadStream(_id);
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  } catch (e) {
    return res.status(404).json({ message: 'Not found' });
  }
};

// PATCH /api/messages/:messageId { content }
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ message: 'Content is required' });
    const msg = await Message.findById(messageId).select('conversation sender type');
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (String(msg.sender) !== String(req.user.id)) return res.status(403).json({ message: 'Forbidden' });
    if (msg.type !== 'text') return res.status(400).json({ message: 'Only text messages can be edited' });

    msg.content = String(content).trim();
    await msg.save();

    const payload = {
      id: String(msg._id),
      conversationId: String(msg.conversation),
      type: msg.type,
      content: msg.content,
    };
    try { const io = getIO(); io && io.to(String(msg.conversation)).emit('message_updated', payload); } catch {}
    // Notify all participants via SSE fallback too
    try {
      const convo = await Conversation.findById(msg.conversation).select('participants');
      if (convo) notifyUsers(convo.participants, 'message_updated', payload);
    } catch (_) {
      // ignore SSE fallback errors
    }
    return res.json(payload);
  } catch (e) {
    console.error('editMessage error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages/:conversationId/read
exports.markRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const convo = await Conversation.findById(conversationId).select('participants');
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.map(String).includes(String(req.user.id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const result = await Message.updateMany(
      { conversation: conversationId, sender: { $ne: req.user.id }, readBy: { $ne: req.user.id } },
      { $addToSet: { readBy: req.user.id } }
    );
    // Fetch updated ids (optional; can be omitted to save query)
    const updated = await Message.find({ conversation: conversationId, readBy: req.user.id }).select('_id').lean();
    const messageIds = updated.map((m) => String(m._id));
    const payload = { conversationId: String(conversationId), reader: String(req.user.id), messageIds };
    try { const io = getIO(); io && io.to(String(conversationId)).emit('messages_read', payload); } catch {}
    notifyUsers(convo.participants, 'messages_read', payload);
    res.json({ updated: result.modifiedCount || 0, messageIds });
  } catch (e) {
    console.error('markRead error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages/typing/:otherUserId { typing: boolean }
exports.typing = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const { typing } = req.body || {};
    const convo = await ensureConversation(req.user.id, otherUserId);
    const toNotify = convo.participants.filter((p) => String(p) !== String(req.user.id));
    notifyUsers(toNotify, 'typing', {
      conversationId: String(convo._id),
      from: String(req.user.id),
      typing: !!typing,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('typing error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// Ensure a two-user conversation exists
async function ensureConversation(userA, userB) {
  const ids = [String(userA), String(userB)];
  const existing = await Conversation.findOne({ participants: { $all: ids, $size: 2 } });
  if (existing) return existing;
  const created = await Conversation.create({ participants: ids });
  return created;
}

// GET /api/messages/conversations
exports.getConversations = async (req, res) => {
  try {
    const list = await Conversation.find({ participants: req.user.id })
      .sort({ updatedAt: -1 })
      .populate('participants', 'username profile');

    const items = list.map((c) => {
      const others = (c.participants || []).filter((u) => String(u._id) !== String(req.user.id));
      return {
        id: String(c._id),
        otherUser: others[0] ? {
          _id: String(others[0]._id),
          username: others[0].username,
          profile: others[0].profile || {},
        } : null,
        lastMessage: c.lastMessage || '',
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : c.updatedAt.toISOString(),
        unreadCount: 0, // placeholder without read receipts
      };
    });
    res.json(items);
  } catch (e) {
    console.error('getConversations error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages/conversations/:otherUserId
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const other = await User.findById(otherUserId).select('_id');
    if (!other) return res.status(404).json({ message: 'User not found' });
    const convo = await ensureConversation(req.user.id, otherUserId);
    res.json({ id: String(convo._id) });
  } catch (e) {
    console.error('getOrCreateConversation error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/messages/:conversationId?limit=50&before=ISO
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const convo = await Conversation.findById(conversationId).select('participants');
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.map(String).includes(String(req.user.id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const q = { conversation: conversationId };
    if (before) q.createdAt = { $lt: before };

    const msgs = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('replyTo', 'content type')
      .lean();
    const items = msgs.reverse().map((m) => ({
      id: String(m._id),
      conversationId: String(m.conversation),
      type: m.type,
      content: m.content || '',
      mediaUrl: m.mediaUrl || undefined,
      sender: String(m.sender),
      createdAt: m.createdAt.toISOString(),
      readBy: Array.isArray(m.readBy) ? m.readBy.map(String) : [],
      replyTo: m.replyTo ? { id: String(m.replyTo._id), content: m.replyTo.content || '', type: m.replyTo.type } : null,
      deliveredBy: Array.isArray(m.deliveredBy) ? m.deliveredBy.map(String) : [],
      reactions: Array.isArray(m.reactions)
        ? m.reactions.map((r) => ({ user: String(r.user), emoji: r.emoji }))
        : [],
    }));
    res.json(items);
  } catch (e) {
    console.error('getMessages error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages/:otherUserId/text { content }
exports.sendText = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const { content, replyTo } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ message: 'Content is required' });

    const convo = await ensureConversation(req.user.id, otherUserId);
    const msg = await Message.create({
      conversation: convo._id,
      sender: req.user.id,
      type: 'text',
      content: String(content).trim(),
      readBy: [req.user.id],
      replyTo: replyTo || null,
    });

    convo.lastMessage = msg.content;
    convo.lastMessageAt = msg.createdAt;
    convo.lastSender = req.user.id;
    await convo.save();

    const payload = {
      id: String(msg._id),
      conversationId: String(convo._id),
      type: msg.type,
      content: msg.content,
      sender: String(msg.sender),
      createdAt: msg.createdAt.toISOString(),
      readBy: [String(req.user.id)],
      replyTo: replyTo ? { id: String(replyTo) } : null,
    };
    try { const io = getIO(); if (io) { io.to(String(convo._id)).emit('message_created', payload); convo.participants.forEach((u) => io.to(String(u)).emit('message_created', payload)); } } catch {}
    notifyUsers(convo.participants, 'message_created', payload);
    res.status(201).json(payload);
  } catch (e) {
    console.error('sendText error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages/:otherUserId/media (image/audio)
exports.sendMedia = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    if (!req.file) return res.status(400).json({ message: 'File is required' });
    const isImage = req.file.mimetype.startsWith('image/');
    const isAudio = req.file.mimetype.startsWith('audio/');
    const type = isImage ? 'image' : isAudio ? 'audio' : 'text';
    let mediaUrl = '';
    // Try Cloudinary first if configured
    let usedCloudinary = false;
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        const base = path.basename(req.file.originalname || 'upload', path.extname(req.file.originalname || ''));
        const filename = `${Date.now()}_${base}`;
        const result = await uploadBufferToCloudinary(req.file.buffer, filename, req.file.mimetype);
        if (result && result.secure_url) {
          mediaUrl = result.secure_url;
          usedCloudinary = true;
        }
      } catch (e) {
        // fall through to GridFS
      }
    }
    if (!usedCloudinary) {
      // Persist file to MongoDB GridFS
      const base = path.basename(req.file.originalname || 'upload', path.extname(req.file.originalname || ''))
        .replace(/[^a-z0-9-_]/gi, '_');
      const filename = `${Date.now()}_${base}${path.extname(req.file.originalname || '')}`;
      const fileId = await saveBufferToGridFS(filename, req.file.mimetype, req.file.buffer);
      mediaUrl = `/api/messages/media/${String(fileId)}`;
    }

    const convo = await ensureConversation(req.user.id, otherUserId);
    const msg = await Message.create({
      conversation: convo._id,
      sender: req.user.id,
      type,
      mediaUrl,
      content: type === 'image' ? '📷 Image' : type === 'audio' ? '🎤 Voice note' : '',
      readBy: [req.user.id],
    });

    convo.lastMessage = msg.content;
    convo.lastMessageAt = msg.createdAt;
    convo.lastSender = req.user.id;
    await convo.save();

    const payload = {
      id: String(msg._id),
      conversationId: String(convo._id),
      type: msg.type,
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      sender: String(msg.sender),
      createdAt: msg.createdAt.toISOString(),
      readBy: [String(req.user.id)],
    };
    try { const io = getIO(); if (io) { io.to(String(convo._id)).emit('message_created', payload); convo.participants.forEach((u) => io.to(String(u)).emit('message_created', payload)); } } catch {}
    notifyUsers(convo.participants, 'message_created', payload);
    return res.status(201).json(payload);
  } catch (e) {
    console.error('sendMedia error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages/:conversationId/delivered
exports.markDelivered = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const convo = await Conversation.findById(conversationId).select('participants');
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.map(String).includes(String(req.user.id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: req.user.id }, deliveredBy: { $ne: req.user.id } },
      { $addToSet: { deliveredBy: req.user.id } }
    );
    const ids = await Message.find({ conversation: conversationId, deliveredBy: req.user.id }).select('_id').lean();
    const messageIds = ids.map((m) => String(m._id));
    const payload = { conversationId: String(conversationId), deliverer: String(req.user.id), messageIds };
    try { const io = getIO(); io && io.to(String(conversationId)).emit('messages_delivered', payload); } catch {}
    notifyUsers(convo.participants, 'messages_delivered', payload);
    return res.json({ ok: true, messageIds });
  } catch (e) {
    console.error('markDelivered error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/messages/reactions/:messageId { emoji }
exports.reactMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body || {};
    if (!emoji) return res.status(400).json({ message: 'Emoji is required' });
    const msg = await Message.findById(messageId).select('conversation reactions');
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    const convo = await Conversation.findById(msg.conversation).select('participants');
    if (!convo || !convo.participants.map(String).includes(String(req.user.id))) return res.status(403).json({ message: 'Forbidden' });

    // Toggle same emoji; ensure single reaction per user
    const existingIndex = (msg.reactions || []).findIndex((r) => String(r.user) === String(req.user.id));
    if (existingIndex >= 0) {
      msg.reactions.splice(existingIndex, 1);
    }
    msg.reactions.push({ user: req.user.id, emoji });
    await msg.save();

    const payload = { messageId: String(messageId), user: String(req.user.id), emoji };
    try { const io = getIO(); io && io.to(String(convo._id)).emit('reaction_updated', payload); } catch {}
    notifyUsers(convo.participants, 'reaction_updated', payload);
    return res.json({ ok: true });
  } catch (e) {
    console.error('reactMessage error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/messages/reactions/:messageId
exports.unreactMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = await Message.findById(messageId).select('conversation reactions');
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    const convo = await Conversation.findById(msg.conversation).select('participants');
    if (!convo || !convo.participants.map(String).includes(String(req.user.id))) return res.status(403).json({ message: 'Forbidden' });

    msg.reactions = (msg.reactions || []).filter((r) => String(r.user) !== String(req.user.id));
    await msg.save();

    const payload = { messageId: String(messageId), user: String(req.user.id), emoji: null };
    try { const io = getIO(); io && io.to(String(convo._id)).emit('reaction_updated', payload); } catch {}
    notifyUsers(convo.participants, 'reaction_updated', payload);
    return res.json({ ok: true });
  } catch (e) {
    console.error('unreactMessage error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/messages/:messageId
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = await Message.findById(messageId).select('conversation sender');
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (String(msg.sender) !== String(req.user.id)) return res.status(403).json({ message: 'Forbidden' });
    const convo = await Conversation.findById(msg.conversation).select('participants');
    await Message.deleteOne({ _id: messageId });
    const payload = { conversationId: String(msg.conversation), messageId: String(messageId) };
    try { const io = getIO(); io && io.to(String(msg.conversation)).emit('message_deleted', payload); } catch {}
    notifyUsers(convo.participants, 'message_deleted', payload);
    return res.json({ success: true });
  } catch (e) {
    console.error('deleteMessage error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/messages/:conversationId/search?q=text&limit=50
exports.searchMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const qtext = (req.query.q || '').toString().trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const convo = await Conversation.findById(conversationId).select('participants');
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.map(String).includes(String(req.user.id))) return res.status(403).json({ message: 'Forbidden' });
    if (!qtext) return res.json([]);
    const regex = new RegExp(qtext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const msgs = await Message.find({ conversation: conversationId, content: regex })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const items = msgs.map((m) => ({ id: String(m._id), conversationId: String(m.conversation), type: m.type, content: m.content || '', mediaUrl: m.mediaUrl || undefined, sender: String(m.sender), createdAt: m.createdAt.toISOString() }));
    return res.json(items);
  } catch (e) {
    console.error('searchMessages error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};
