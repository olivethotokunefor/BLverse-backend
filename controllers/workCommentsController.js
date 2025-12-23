const mongoose = require('mongoose');
const Work = require('../models/Work');
const WorkComment = require('../models/WorkComment');
const WorkCommentLike = require('../models/WorkCommentLike');
const { createNotification, createMentionNotifications } = require('./notificationsController');

function toIso(d) {
  try {
    return d ? new Date(d).toISOString() : new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function mapComment(c, likedByMe) {
  return {
    _id: String(c._id),
    work: String(c.work),
    chapterNumber: c.chapterNumber,
    parent: c.parent ? String(c.parent) : null,
    user: c.user && typeof c.user === 'object'
      ? {
          _id: String(c.user._id),
          username: c.user.username || 'Anonymous',
          profile: c.user.profile || {},
        }
      : { _id: String(c.user) },
    content: c.content || '',
    likesCount: typeof c.likesCount === 'number' ? c.likesCount : 0,
    likedByMe: !!likedByMe,
    createdAt: toIso(c.createdAt),
  };
}

exports.listChapterComments = async (req, res) => {
  try {
    const { workId, number } = req.params;
    const chapterNumber = Math.max(parseInt(number, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

    if (!mongoose.isValidObjectId(workId)) return res.status(400).json({ message: 'Invalid work id' });

    const comments = await WorkComment.find({ work: workId, chapterNumber })
      .sort({ createdAt: 1 })
      .limit(limit)
      .populate('user', 'username profile')
      .lean();

    let likedSet = new Set();
    if (req.user?.id && comments.length) {
      const likes = await WorkCommentLike.find({ comment: { $in: comments.map((c) => c._id) }, user: req.user.id }).select('comment');
      likedSet = new Set(likes.map((l) => String(l.comment)));
    }

    const mapped = comments.map((c) => mapComment(c, likedSet.has(String(c._id))));

    const byId = new Map();
    for (const c of mapped) byId.set(c._id, { ...c, replies: [] });

    const roots = [];
    for (const c of mapped) {
      const node = byId.get(c._id);
      if (c.parent && byId.has(c.parent)) {
        byId.get(c.parent).replies.push(node);
      } else {
        roots.push(node);
      }
    }

    res.json({ items: roots });
  } catch (e) {
    console.error('listChapterComments error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createChapterComment = async (req, res) => {
  try {
    const { workId, number } = req.params;
    const chapterNumber = Math.max(parseInt(number, 10) || 1, 1);
    const { content, parentId } = req.body || {};

    if (!content || !String(content).trim()) return res.status(400).json({ message: 'Content is required' });
    if (!mongoose.isValidObjectId(workId)) return res.status(400).json({ message: 'Invalid work id' });

    const work = await Work.findById(workId).select('_id author chaptersCount chaptersTotal');
    if (!work) return res.status(404).json({ message: 'Work not found' });

    const maxCh = work.chaptersCount || work.chaptersTotal || 0;
    if (maxCh && chapterNumber > maxCh) {
      return res.status(400).json({ message: 'Invalid chapter number' });
    }

    let parent = null;
    if (parentId) {
      if (!mongoose.isValidObjectId(parentId)) return res.status(400).json({ message: 'Invalid parent id' });
      parent = await WorkComment.findById(parentId).select('_id user work chapterNumber');
      if (!parent) return res.status(404).json({ message: 'Parent comment not found' });
      if (String(parent.work) !== String(workId) || parent.chapterNumber !== chapterNumber) {
        return res.status(400).json({ message: 'Parent comment mismatch' });
      }
    }

    const created = await WorkComment.create({
      work: workId,
      chapterNumber,
      user: req.user.id,
      parent: parent ? parent._id : null,
      content: String(content).trim(),
      likesCount: 0,
    });

    const populated = await WorkComment.findById(created._id).populate('user', 'username profile').lean();

    try {
      const url = `/works/${String(workId)}/chapters/${String(chapterNumber)}`;
      await createMentionNotifications({
        actorId: req.user.id,
        entityType: 'work_comment',
        entityId: created._id,
        url,
        text: created.content,
      });

      if (parent && parent.user) {
        await createNotification({
          recipientId: parent.user,
          actorId: req.user.id,
          type: 'reply',
          entityType: 'work_comment',
          entityId: created._id,
          url,
        });
      } else {
        await createNotification({
          recipientId: work.author,
          actorId: req.user.id,
          type: 'comment',
          entityType: 'work',
          entityId: work._id,
          url,
        });
      }
    } catch (e) {
      console.error('work comment notifications error', e);
    }

    if (!populated) {
      return res.status(201).json({
        _id: String(created._id),
        work: String(created.work),
        chapterNumber: created.chapterNumber,
        parent: created.parent ? String(created.parent) : null,
        user: { _id: String(created.user) },
        content: created.content || '',
        likesCount: 0,
        likedByMe: false,
        createdAt: new Date(created.createdAt || Date.now()).toISOString(),
      });
    }

    return res.status(201).json(mapComment(populated, false));
  } catch (e) {
    console.error('createChapterComment error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.toggleWorkCommentLike = async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.isValidObjectId(commentId)) return res.status(400).json({ message: 'Invalid comment id' });

    const comment = await WorkComment.findById(commentId).select('_id user work chapterNumber');
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const existing = await WorkCommentLike.findOne({ comment: commentId, user: req.user.id }).select('_id');
    let liked = false;
    if (existing) {
      await WorkCommentLike.deleteOne({ _id: existing._id });
      liked = false;
    } else {
      try {
        await WorkCommentLike.create({ comment: commentId, user: req.user.id });
      } catch (e) {
        if (!(e && e.code === 11000)) throw e;
      }
      liked = true;
    }

    const exactCount = await WorkCommentLike.countDocuments({ comment: commentId });
    await WorkComment.updateOne({ _id: commentId }, { $set: { likesCount: exactCount } });

    if (liked) {
      try {
        await createNotification({
          recipientId: comment.user,
          actorId: req.user.id,
          type: 'like',
          entityType: 'work_comment',
          entityId: comment._id,
          url: `/works/${String(comment.work)}/chapters/${String(comment.chapterNumber)}`,
        });
      } catch (e) {
        console.error('work comment like notification error', e);
      }
    }

    res.json({ liked, likesCount: exactCount });
  } catch (e) {
    console.error('toggleWorkCommentLike error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateWorkComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body || {};

    if (!mongoose.isValidObjectId(commentId)) return res.status(400).json({ message: 'Invalid comment id' });
    if (!content || !String(content).trim()) return res.status(400).json({ message: 'Content is required' });

    const comment = await WorkComment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const isOwner = String(comment.user) === String(req.user.id);
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });

    comment.content = String(content).trim();
    await comment.save();

    const populated = await WorkComment.findById(comment._id).populate('user', 'username profile').lean();

    let likedByMe = false;
    try {
      const like = await WorkCommentLike.findOne({ comment: comment._id, user: req.user.id }).select('_id');
      likedByMe = !!like;
    } catch {}

    return res.json({ ok: true, comment: mapComment(populated, likedByMe) });
  } catch (e) {
    console.error('updateWorkComment error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteWorkComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.isValidObjectId(commentId)) return res.status(400).json({ message: 'Invalid comment id' });

    const comment = await WorkComment.findById(commentId).select('_id user');
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const isOwner = String(comment.user) === String(req.user.id);
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });

    // Cascade delete: comment + its replies + likes for all
    const replyIds = await WorkComment.find({ parent: comment._id }).select('_id').lean();
    const ids = [comment._id, ...replyIds.map((r) => r._id)];

    await WorkCommentLike.deleteMany({ comment: { $in: ids } });
    await WorkComment.deleteMany({ _id: { $in: ids } });

    return res.json({ ok: true });
  } catch (e) {
    console.error('deleteWorkComment error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};
