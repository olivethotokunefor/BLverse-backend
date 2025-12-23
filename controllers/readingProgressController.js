const ReadingProgress = require('../models/ReadingProgress');

exports.upsertProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workId, chapterNumber, pct } = req.body || {};

    if (!workId) return res.status(400).json({ message: 'workId is required' });
    const n = Math.max(1, parseInt(chapterNumber, 10) || 1);
    const p = pct == null ? undefined : Math.max(0, Math.min(1, Number(pct)));

    const update = {
      lastChapterNumber: n,
      ...(p === undefined ? {} : { pct: p }),
    };

    const doc = await ReadingProgress.findOneAndUpdate(
      { user: userId, work: workId },
      { $set: update },
      { upsert: true, new: true }
    ).lean();

    return res.json({ ok: true, progress: doc });
  } catch (err) {
    console.error('upsertProgress error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyProgressForWork = async (req, res) => {
  try {
    const userId = req.user.id;
    const { workId } = req.params;
    if (!workId) return res.status(400).json({ message: 'workId is required' });

    const doc = await ReadingProgress.findOne({ user: userId, work: workId }).lean();
    return res.json({ ok: true, progress: doc || null });
  } catch (err) {
    console.error('getMyProgressForWork error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listCurrentlyReading = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));

    const items = await ReadingProgress.find({ user: userId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .populate({
        path: 'work',
        select: 'title coverImage chaptersCount chaptersTotal author updatedAt',
        populate: { path: 'author', select: 'username profile.fullName' },
      })
      .lean();

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('listCurrentlyReading error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
