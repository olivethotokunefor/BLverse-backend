// @desc    Get replies for a comment
// @route   GET /api/community/comments/:commentId/replies
// @access  Private
exports.getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const max = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const replies = await PostComment.find({ parent: commentId })
      .sort({ createdAt: 1 })
      .limit(max)
      .populate('user', 'username profile');

    const items = replies.map((c) => ({
      _id: c._id,
      user: {
        _id: c.user?._id || '',
        username: c.user?.username || 'Anonymous',
        profile: { fullName: c.user?.profile?.fullName || undefined, avatar: c.user?.profile?.avatar || undefined },
      },
      content: c.content || '',
      createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
      parent: commentId,
    }));
    return res.json(items);
  } catch (error) {
    console.error('Get replies error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Create a reply to a comment
// @route   POST /api/community/comments/:commentId/replies
// @access  Private
exports.createReply = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const parent = await PostComment.findById(commentId).select('post');
    if (!parent) {
      return res.status(404).json({ message: 'Parent comment not found' });
    }

    const parentAuthor = await PostComment.findById(commentId).select('user');

    const mongoUser = await User.findById(req.user.id).select('username profile');
    const created = await PostComment.create({
      post: parent.post,
      user: req.user.id,
      parent: commentId,
      content: String(content).trim(),
    });

    const response = {
      _id: created._id,
      user: {
        _id: String(req.user.id),
        username: mongoUser?.username || 'Anonymous',
        profile: { fullName: mongoUser?.profile?.fullName || undefined, avatar: mongoUser?.profile?.avatar || undefined },
      },
      content: created.content,
      createdAt: created.createdAt?.toISOString() || new Date().toISOString(),
      parent: commentId,
    };
    broadcast('reply_created', { commentId, reply: response });

    // Notify the author of the parent comment (reply)
    try {
      if (parentAuthor && parentAuthor.user) {
        await createNotification({
          recipientId: parentAuthor.user,
          actorId: req.user.id,
          type: 'reply',
          entityType: 'community_comment',
          entityId: created._id,
          url: `/community#post-${String(parent.post)}`,
        });
      }
    } catch (e) {
      console.error('reply notification error', e);
    }

    // Mention notifications in reply content
    try {
      await createMentionNotifications({
        actorId: req.user.id,
        entityType: 'community_comment',
        entityId: created._id,
        url: `/community#post-${String(parent.post)}`,
        text: created.content,
      });
    } catch (e) {
      console.error('reply mention notification error', e);
    }

    return res.status(201).json(response);
  } catch (error) {
    console.error('Create reply error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};
// controllers/communityController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const CommunityPost = require('../models/CommunityPost');
const PostLike = require('../models/PostLike');
const PostComment = require('../models/PostComment');
const { createNotification, createMentionNotifications } = require('./notificationsController');

// --- Simple in-memory SSE hub ---
const sseClients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) {}
  }
}

exports.stream = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`event: ping\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
};
// @desc    Get recent community posts
// @route   GET /api/community/posts
// @access  Private
exports.getPosts = async (req, res) => {
  console.log('🔹 getPosts route HIT', { query: req.query, headers: req.headers });
  try {
    const max = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const posts = await CommunityPost.find()
      .sort({ createdAt: -1 })
      .limit(max)
      .populate('user', 'username profile');

    const items = posts.map((p) => ({
      _id: p._id,
      user: {
        _id: p.user?._id || '',
        username: p.user?.username || 'Anonymous',
        profile: {
          fullName: p.user?.profile?.fullName || undefined,
          bio: p.user?.profile?.bio || undefined,
          avatar: p.user?.profile?.avatar || undefined,
          location: p.user?.profile?.location || undefined,
        },
      },
      content: p.content || '',
      tags: Array.isArray(p.tags) ? p.tags : [],
      likesCount: typeof p.likesCount === 'number' ? p.likesCount : 0,
      createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
      mediaUrl: p.mediaUrl || undefined,
    }));

    return res.json(items);
  } catch (error) {
    console.error('Get community posts error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Paginated feed with optional tag filter
// @route   GET /api/community/feed
// @access  Private
exports.getFeed = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const tag = typeof req.query.tag === 'string' && req.query.tag.trim() ? req.query.tag.trim() : null;
    const cursorCreatedAt = req.query.cursorCreatedAt ? new Date(req.query.cursorCreatedAt) : null;
    const cursorId = req.query.cursorId || null;
    // Optional auth: if token provided, compute likedByMe
    let token = req.header('x-auth-token');
    if (!token) {
      const auth = req.header('authorization') || req.header('Authorization');
      if (auth && /^Bearer\s+/i.test(auth)) token = auth.replace(/^Bearer\s+/i, '').trim();
    }
    let currentUserId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        currentUserId = decoded && decoded.id ? String(decoded.id) : null;
      } catch (_) {
        currentUserId = null;
      }
    }

    const q = {};
    if (tag) q.tags = tag;
    if (cursorCreatedAt) {
      q.$or = [
        { createdAt: { $lt: cursorCreatedAt } },
        { createdAt: cursorCreatedAt, _id: { $lt: cursorId } },
      ];
    }

    const posts = await CommunityPost.find(q)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate('user', 'username profile');

    let likedSet = new Set();
    if (currentUserId && posts.length) {
      const likes = await PostLike.find({ post: { $in: posts.map((p) => p._id) }, user: currentUserId }).select('post');
      likedSet = new Set(likes.map((l) => String(l.post)));
    }

    const items = posts.map((p) => ({
      _id: p._id,
      user: {
        _id: p.user?._id || '',
        username: p.user?.username || 'Anonymous',
        profile: {
          fullName: p.user?.profile?.fullName || undefined,
          bio: p.user?.profile?.bio || undefined,
          avatar: p.user?.profile?.avatar || undefined,
          location: p.user?.profile?.location || undefined,
        },
      },
      content: p.content || '',
      tags: Array.isArray(p.tags) ? p.tags : [],
      likesCount: typeof p.likesCount === 'number' ? p.likesCount : 0,
      createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
      mediaUrl: p.mediaUrl || undefined,
      likedByMe: currentUserId ? likedSet.has(String(p._id)) : undefined,
    }));

    const last = posts[posts.length - 1];
    const nextCursor = last
      ? { cursorCreatedAt: last.createdAt.toISOString(), cursorId: String(last._id) }
      : undefined;

    return res.json({ items, nextCursor });
  } catch (error) {
    console.error('Get feed error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Toggle like on a post
// @route   POST /api/community/posts/:postId/likes/toggle
// @access  Private
exports.toggleLike = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = String(req.user.id);

    const post = await CommunityPost.findById(postId).select('_id user');
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const existing = await PostLike.findOne({ post: postId, user: userId });
    let liked;
    if (existing) {
      await PostLike.deleteOne({ _id: existing._id });
      liked = false;
    } else {
      try {
        await PostLike.create({ post: postId, user: userId });
        liked = true;
      } catch (e) {
        // Handle duplicate like race condition gracefully
        if (e && e.code === 11000) {
          liked = true;
        } else {
          throw e;
        }
      }
    }

    // Authoritative likesCount from PostLike collection
    const exactCount = await PostLike.countDocuments({ post: postId });
    await CommunityPost.updateOne({ _id: postId }, { $set: { likesCount: exactCount } });
    const out = { likesCount: exactCount, liked };
    broadcast('like_toggled', { postId, ...out });

    // Notify post owner on like (only when liking)
    try {
      if (liked) {
        await createNotification({
          recipientId: post.user,
          actorId: req.user.id,
          type: 'like',
          entityType: 'community_post',
          entityId: post._id,
          url: `/community`,
        });
      }
    } catch (e) {
      console.error('like notification error', e);
    }

    return res.json(out);
  } catch (error) {
    console.error('Toggle like error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(msg === 'Post not found' ? 404 : 500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Get comments for a post
// @route   GET /api/community/posts/:postId/comments
// @access  Private
exports.getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const max = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const comments = await PostComment.find({ post: postId })
      .sort({ createdAt: 1 })
      .limit(max)
      .populate('user', 'username profile');

    const items = comments.map((c) => ({
      _id: c._id,
      user: {
        _id: c.user?._id || '',
        username: c.user?.username || 'Anonymous',
        profile: {
          fullName: c.user?.profile?.fullName || undefined,
          avatar: c.user?.profile?.avatar || undefined,
        },
      },
      content: c.content || '',
      createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
    }));

    return res.json(items);
  } catch (error) {
    console.error('Get comments error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Create a comment for a post
// @route   POST /api/community/posts/:postId/comments
// @access  Private
exports.createComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const post = await CommunityPost.findById(postId).select('_id user');
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const mongoUser = await User.findById(req.user.id).select('username profile');
    const created = await PostComment.create({
      post: postId,
      user: req.user.id,
      content: String(content).trim(),
    });

    const response = {
      _id: created._id,
      user: {
        _id: String(req.user.id),
        username: mongoUser?.username || 'Anonymous',
        profile: { fullName: mongoUser?.profile?.fullName || undefined, avatar: mongoUser?.profile?.avatar || undefined },
      },
      content: created.content,
      createdAt: created.createdAt?.toISOString() || new Date().toISOString(),
    };
    broadcast('comment_created', { postId, comment: response });

    // Notify post owner on comment
    try {
      await createNotification({
        recipientId: post.user,
        actorId: req.user.id,
        type: 'comment',
        entityType: 'community_post',
        entityId: post._id,
        url: `/community`,
      });
    } catch (e) {
      console.error('comment notification error', e);
    }

    // Mention notifications in comment content
    try {
      await createMentionNotifications({
        actorId: req.user.id,
        entityType: 'community_comment',
        entityId: created._id,
        url: `/community`,
        text: created.content,
      });
    } catch (e) {
      console.error('comment mention notification error', e);
    }

    return res.status(201).json(response);
  } catch (error) {
    console.error('Create comment error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Create a community post
// @route   POST /api/community/posts
// @access  Private
exports.createPost = async (req, res) => {
  try {
    const { content, tags } = req.body;

    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const mongoUser = await User.findById(req.user?.id).select('username profile');
    if (!mongoUser) {
      return res.status(404).json({ message: 'User not found in database' });
    }

    const tagList = Array.isArray(tags)
      ? tags
      : typeof tags === 'string'
      ? tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const created = await CommunityPost.create({
      user: req.user.id,
      content: String(content).trim(),
      tags: tagList,
      likesCount: 0,
    });

    const response = {
      _id: created._id,
      user: {
        _id: String(req.user.id),
        username: mongoUser.username || 'Anonymous',
        profile: {
          fullName: mongoUser.profile?.fullName || undefined,
          bio: mongoUser.profile?.bio || undefined,
          avatar: mongoUser.profile?.avatar || undefined,
          location: mongoUser.profile?.location || undefined,
        },
      },
      content: created.content,
      tags: created.tags,
      likesCount: created.likesCount,
      createdAt: created.createdAt?.toISOString() || new Date().toISOString(),
    };
    broadcast('post_created', response);

    // Mention notifications in post content
    try {
      await createMentionNotifications({
        actorId: req.user.id,
        entityType: 'community_post',
        entityId: created._id,
        url: `/community`,
        text: created.content,
      });
    } catch (e) {
      console.error('post mention notification error', e);
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('Create community post error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Update a community post
// @route   PATCH /api/community/posts/:postId
// @access  Private
exports.updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, tags } = req.body || {};

    const post = await CommunityPost.findById(postId).select('user content tags');
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (String(post.user) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (typeof content === 'string') post.content = content.trim();
    if (Array.isArray(tags)) post.tags = tags;
    else if (typeof tags === 'string') post.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);

    await post.save();

    const mongoUser = await User.findById(req.user.id).select('username profile');
    const response = {
      _id: post._id,
      user: {
        _id: String(req.user.id),
        username: mongoUser?.username || 'Anonymous',
        profile: {
          fullName: mongoUser?.profile?.fullName || undefined,
          bio: mongoUser?.profile?.bio || undefined,
          avatar: mongoUser?.profile?.avatar || undefined,
          location: mongoUser?.profile?.location || undefined,
        },
      },
      content: post.content,
      tags: post.tags,
      likesCount: post.likesCount,
      createdAt: post.createdAt?.toISOString() || new Date().toISOString(),
      mediaUrl: post.mediaUrl || undefined,
    };
    broadcast('post_updated', response);
    return res.json(response);
  } catch (error) {
    console.error('Update community post error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Delete a community post
// @route   DELETE /api/community/posts/:postId
// @access  Private
exports.deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await CommunityPost.findById(postId).select('user');
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (String(post.user) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await Promise.all([
      PostLike.deleteMany({ post: postId }),
      PostComment.deleteMany({ post: postId }),
      CommunityPost.deleteOne({ _id: postId }),
    ]);

    broadcast('post_deleted', { postId });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete community post error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Update a comment
// @route   PATCH /api/community/comments/:commentId
// @access  Private
exports.updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body || {};
    const comment = await PostComment.findById(commentId).select('user content createdAt');
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    if (String(comment.user) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }
    comment.content = String(content).trim();
    await comment.save();
    const mongoUser = await User.findById(req.user.id).select('username profile');
    const response = {
      _id: comment._id,
      user: {
        _id: String(req.user.id),
        username: mongoUser?.username || 'Anonymous',
        profile: { fullName: mongoUser?.profile?.fullName || undefined, avatar: mongoUser?.profile?.avatar || undefined },
      },
      content: comment.content,
      createdAt: comment.createdAt?.toISOString() || new Date().toISOString(),
    };
    broadcast('comment_updated', { comment: response });
    return res.json(response);
  } catch (error) {
    console.error('Update comment error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Delete a comment
// @route   DELETE /api/community/comments/:commentId
// @access  Private
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const comment = await PostComment.findById(commentId).select('user');
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    if (String(comment.user) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await PostComment.deleteOne({ _id: commentId });
    broadcast('comment_deleted', { commentId });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};

// @desc    Attach image to a post
// @route   POST /api/community/posts/:postId/image
// @access  Private
exports.attachPostImage = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await CommunityPost.findById(postId).select('user mediaUrl createdAt content tags likesCount');
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (String(post.user) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    // Upload to Cloudinary if configured
    try {
      const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER_POSTS } = process.env;
      if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
        return res.status(500).json({ message: 'Cloud storage not configured' });
      }

      const cloudinary = require('cloudinary').v2;
      try {
        cloudinary.config({
          cloud_name: CLOUDINARY_CLOUD_NAME,
          api_key: CLOUDINARY_API_KEY,
          api_secret: CLOUDINARY_API_SECRET,
          secure: true,
        });
      } catch (e) {
        // ignore config errors; we'll try upload and handle failures
      }

      const path = require('path');
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      const base = String(path.basename(req.file.originalname || 'upload', ext)).replace(/[^a-zA-Z0-9_-]/g, '_');
      const publicId = `${Date.now()}_${base}`;
      const folder = CLOUDINARY_FOLDER_POSTS || 'blverse/community';

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'image', public_id: publicId }, (err, data) => (err ? reject(err) : resolve(data)));
        stream.end(req.file.buffer);
      });

      if (!result || !result.secure_url) {
        throw new Error('Cloudinary upload failed');
      }

      // Optionally persist to Media collection for metadata
      try {
        const Media = require('../models/Media');
        await Media.create({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type || 'image',
          format: result.format || '',
          bytes: result.bytes || 0,
          duration: result.duration || 0,
          width: result.width || 0,
          height: result.height || 0,
          createdBy: req.user ? req.user.id : undefined,
        });
      } catch (e) {
        console.warn('Failed to create Media document:', e && e.message ? e.message : e);
      }

      post.mediaUrl = result.secure_url;
      await post.save();

      const mongoUser = await User.findById(req.user.id).select('username profile');
      const response = {
        _id: post._id,
        user: {
          _id: String(req.user.id),
          username: mongoUser?.username || 'Anonymous',
          profile: {
            fullName: mongoUser?.profile?.fullName || undefined,
            bio: mongoUser?.profile?.bio || undefined,
            avatar: mongoUser?.profile?.avatar || undefined,
            location: mongoUser?.profile?.location || undefined,
          },
        },
        content: post.content,
        tags: post.tags,
        likesCount: post.likesCount,
        createdAt: post.createdAt?.toISOString() || new Date().toISOString(),
        mediaUrl: post.mediaUrl,
      };
      broadcast('post_updated', response);
      return res.json(response);
    } catch (err) {
      console.error('Attach post image (cloud) error:', err);
      const msg = (err && err.message) || 'Upload failed';
      return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Upload failed' });
    }
  } catch (error) {
    console.error('Attach post image error:', error);
    const msg = (error && error.message) || 'Server error';
    return res.status(500).json({ message: process.env.NODE_ENV !== 'production' ? msg : 'Server error' });
  }
};
