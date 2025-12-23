// @desc    Cursor-based stories feed
// @route   GET /api/stories/feed
// @access  Private
exports.getStoriesFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const tag = req.query.tag ? String(req.query.tag) : undefined;
    const cursorCreatedAt = req.query.cursorCreatedAt ? new Date(req.query.cursorCreatedAt) : undefined;
    const cursorId = req.query.cursorId ? String(req.query.cursorId) : undefined;
    const filter = tag ? { tags: tag } : {};
    const cursorFilter = cursorCreatedAt
      ? { $or: [ { createdAt: { $lt: cursorCreatedAt } }, { createdAt: cursorCreatedAt, _id: { $lt: cursorId } } ] }
      : {};
    const items = await Story.find({ ...filter, ...cursorFilter })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate('author', 'username profile');
    let nextCursor;
    if (items.length === limit) {
      const last = items[items.length - 1];
      nextCursor = { cursorCreatedAt: last.createdAt.toISOString(), cursorId: String(last._id) };
    }
    res.json({ items, nextCursor });
  } catch (error) {
    console.error('Stories feed error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
const Story = require('../models/Story');
const StoryLike = require('../models/StoryLike');
const StoryComment = require('../models/StoryComment');
const StoryFavorite = require('../models/StoryFavorite');
const { getIO } = require('../realtime/io');

// @desc    Get stories
// @route   GET /api/stories
// @access  Private
exports.getStories = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const tag = req.query.tag ? String(req.query.tag) : undefined;
    const filter = tag ? { tags: tag } : {};
    const stories = await Story.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'username profile');
    res.json(stories);
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Toggle favorite on a story
// @route   POST /api/stories/:storyId/favorites/toggle
// @access  Private
exports.toggleFavorite = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;
    const existing = await StoryFavorite.findOne({ story: storyId, user: userId });
    let favorited = false;
    if (existing) {
      await existing.deleteOne();
      favorited = false;
    } else {
      await StoryFavorite.create({ story: storyId, user: userId });
      favorited = true;
    }
    try { const io = getIO(); io && io.emit('story_favorite_toggled', { storyId, favorited, userId }); } catch {}
    return res.json({ favorited });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Toggle like on a story
// @route   POST /api/stories/:storyId/likes/toggle
// @access  Private
exports.toggleLike = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;
    const existing = await StoryLike.findOne({ story: storyId, user: userId });
    let liked = false;
    if (existing) {
      await existing.deleteOne();
      liked = false;
      await Story.updateOne({ _id: storyId }, { $inc: { likesCount: -1 } });
    } else {
      await StoryLike.create({ story: storyId, user: userId });
      liked = true;
      await Story.updateOne({ _id: storyId }, { $inc: { likesCount: 1 } });
    }
    const story = await Story.findById(storyId).select('likesCount');
    try { const io = getIO(); io && io.emit('story_like_toggled', { storyId, likesCount: story?.likesCount || 0, liked, userId }); } catch {}
    return res.json({ likesCount: story?.likesCount || 0, liked });
  } catch (error) {
    console.error('Toggle like error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update a story (author only)
// @route   PATCH /api/stories/:storyId
// @access  Private
exports.updateStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (String(story.author) !== String(req.user.id)) return res.status(403).json({ message: 'Forbidden' });
    const { title, content, category, tags } = req.body || {};
    if (title !== undefined) story.title = String(title);
    if (content !== undefined) story.content = String(content);
    if (category !== undefined) story.category = String(category);
    if (tags !== undefined) story.tags = Array.isArray(tags) ? tags : [];
    await story.save();
    const populated = await story.populate('author', 'username profile');
    try { const io = getIO(); io && io.emit('story_updated', populated); } catch {}
    return res.json(populated);
  } catch (error) {
    console.error('Update story error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete a story (author only)
// @route   DELETE /api/stories/:storyId
// @access  Private
exports.deleteStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (String(story.author) !== String(req.user.id)) return res.status(403).json({ message: 'Forbidden' });
    await StoryLike.deleteMany({ story: storyId });
    await StoryComment.deleteMany({ story: storyId });
    await story.deleteOne();
    try { const io = getIO(); io && io.emit('story_deleted', { storyId }); } catch {}
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete story error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    List comments for a story (top-level)
// @route   GET /api/stories/:storyId/comments
// @access  Private
exports.getComments = async (req, res) => {
  try {
    const { storyId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 100;
    const comments = await StoryComment.find({ story: storyId, parent: null })
      .sort({ createdAt: 1 })
      .limit(limit)
      .populate('user', 'username profile');
    return res.json(comments);
  } catch (error) {
    console.error('Get story comments error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a comment on a story (top-level)
// @route   POST /api/stories/:storyId/comments
// @access  Private
exports.createComment = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ message: 'Content is required' });
    const comment = await StoryComment.create({ story: storyId, user: req.user.id, content: String(content).trim(), parent: null });
    const populated = await comment.populate('user', 'username profile');
    try { const io = getIO(); io && io.emit('story_comment_created', { storyId, comment: populated }); } catch {}
    return res.status(201).json(populated);
  } catch (error) {
    console.error('Create story comment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update a comment (owner only)
// @route   PATCH /api/stories/comments/:commentId
// @access  Private
exports.updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body || {};
    const comment = await StoryComment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (String(comment.user) !== String(req.user.id)) return res.status(403).json({ message: 'Forbidden' });
    if (!content || !String(content).trim()) return res.status(400).json({ message: 'Content is required' });
    comment.content = String(content).trim();
    await comment.save();
    const populated = await comment.populate('user', 'username profile');
    try { const io = getIO(); io && io.emit('story_comment_updated', { comment: populated }); } catch {}
    return res.json(populated);
  } catch (error) {
    console.error('Update story comment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete a comment (owner only)
// @route   DELETE /api/stories/comments/:commentId
// @access  Private
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const comment = await StoryComment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (String(comment.user) !== String(req.user.id)) return res.status(403).json({ message: 'Forbidden' });
    await StoryComment.deleteMany({ $or: [{ _id: commentId }, { parent: commentId }] });
    try { const io = getIO(); io && io.emit('story_comment_deleted', { commentId }); } catch {}
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete story comment error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    List replies for a comment
// @route   GET /api/stories/comments/:commentId/replies
// @access  Private
exports.getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 50;
    const replies = await StoryComment.find({ parent: commentId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .populate('user', 'username profile');
    return res.json(replies);
  } catch (error) {
    console.error('Get story replies error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a reply to a comment
// @route   POST /api/stories/comments/:commentId/replies
// @access  Private
exports.createReply = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ message: 'Content is required' });
    const parent = await StoryComment.findById(commentId);
    if (!parent) return res.status(404).json({ message: 'Parent comment not found' });
    const reply = await StoryComment.create({ story: parent.story, user: req.user.id, content: String(content).trim(), parent: parent._id });
    const populated = await reply.populate('user', 'username profile');
    try { const io = getIO(); io && io.emit('story_reply_created', { commentId, reply: populated }); } catch {}
    return res.status(201).json(populated);
  } catch (error) {
    console.error('Create story reply error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a story
// @route   POST /api/stories
// @access  Private
exports.createStory = async (req, res) => {
  try {
    const { title, content, category, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const story = await Story.create({
      author: req.user.id,
      title: title.trim(),
      content,
      category,
      tags: Array.isArray(tags)
        ? tags
        : typeof tags === 'string'
        ? tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    });

    const populated = await story.populate('author', 'username profile');

    try { const io = getIO(); io && io.emit('story_created', populated); } catch {}
    res.status(201).json(populated);
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
