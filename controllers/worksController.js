const Work = require('../models/Work');
const WorkChapter = require('../models/WorkChapter');
const WorkKudos = require('../models/WorkKudos');
const WorkBookmark = require('../models/WorkBookmark');
const WorkHit = require('../models/WorkHit');
const jwt = require('jsonwebtoken');
const { createNotification } = require('./notificationsController');
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

function uploadCoverBufferToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const folder = process.env.CLOUDINARY_FOLDER_WORKS || 'blverse/works';
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

function parseCsv(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean);
  return String(val).split(',').map((s) => s.trim()).filter(Boolean);
}

exports.listWorks = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const {
      sort = 'updated',
      rating,
      language,
      status,
      wordsMin,
      wordsMax,
    } = req.query;

    const includeTags = parseCsv(req.query.tags || req.query.includeTags);
    const excludeTags = parseCsv(req.query.excludeTags);
    const fandoms = parseCsv(req.query.fandom);
    const relationships = parseCsv(req.query.relationship);
    const characters = parseCsv(req.query.character);

    const filter = {};
    if (rating) filter.rating = String(rating);
    if (language) filter.language = String(language);
    if (status) filter.completionStatus = String(status);
    if (wordsMin || wordsMax) {
      filter.words = {};
      if (wordsMin) filter.words.$gte = parseInt(wordsMin, 10) || 0;
      if (wordsMax) filter.words.$lte = parseInt(wordsMax, 10) || 0;
    }
    if (includeTags.length) filter.tags = { $all: includeTags };
    if (excludeTags.length) filter.tags = { ...(filter.tags || {}), $nin: excludeTags };
    if (fandoms.length) filter.fandoms = { $all: fandoms };
    if (relationships.length) filter.relationships = { $all: relationships };
    if (characters.length) filter.characters = { $all: characters };

    const sortMap = {
      updated: { updatedAt: -1, _id: -1 },
      posted: { createdAt: -1, _id: -1 },
      words: { words: -1, _id: -1 },
      kudos: { kudosCount: -1, _id: -1 },
      hits: { hitsCount: -1, _id: -1 },
      bookmarks: { bookmarksCount: -1, _id: -1 },
    };
    const sortObj = sortMap[sort] || sortMap.updated;

    const total = await Work.countDocuments(filter);
    const items = await Work.find(filter)
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'username');

    const pages = Math.ceil(total / limit) || 1;
    return res.json({ items, total, page, pages });
  } catch (err) {
    console.error('listWorks error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getWork = async (req, res) => {
  try {
    const work = await Work.findById(req.params.workId).populate('author', 'username');
    if (!work) return res.status(404).json({ message: 'Work not found' });
    return res.json(work);
  } catch (err) {
    console.error('getWork error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getChapter = async (req, res) => {
  try {
    const { workId, number } = req.params;
    const chapter = await WorkChapter.findOne({ work: workId, number: parseInt(number, 10) || 1 });
    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });
    return res.json(chapter);
  } catch (err) {
    console.error('getChapter error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.giveKudos = async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user.id;
    const work = await Work.findById(workId).select('_id author');
    if (!work) return res.status(404).json({ message: 'Work not found' });
    const existing = await WorkKudos.findOne({ work: workId, user: userId });
    if (existing) {
      return res.json({ ok: true, alreadyGiven: true });
    }
    await WorkKudos.create({ work: workId, user: userId });
    await Work.updateOne({ _id: workId }, { $inc: { kudosCount: 1 } });

    try {
      await createNotification({
        recipientId: work.author,
        actorId: userId,
        type: 'kudos',
        entityType: 'work',
        entityId: work._id,
        url: `/works/${String(work._id)}/chapters/1`,
      });
    } catch (e) {
      console.error('kudos notification error', e);
    }

    return res.json({ ok: true, alreadyGiven: false });
  } catch (err) {
    console.error('giveKudos error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.toggleBookmark = async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user.id;
    const existing = await WorkBookmark.findOne({ work: workId, user: userId });
    let bookmarked = false;
    if (existing) {
      await existing.deleteOne();
      bookmarked = false;
    } else {
      try {
        await WorkBookmark.create({ work: workId, user: userId, private: true });
        bookmarked = true;
      } catch (e) {
        // Handle duplicate bookmark race condition gracefully
        if (e && e.code === 11000) {
          bookmarked = true;
        } else {
          throw e;
        }
      }
    }

    // Keep count authoritative from WorkBookmark collection
    const exactCount = await WorkBookmark.countDocuments({ work: workId });
    await Work.updateOne({ _id: workId }, { $set: { bookmarksCount: exactCount } });
    return res.json({ ok: true, bookmarked, bookmarksCount: exactCount });
  } catch (err) {
    console.error('toggleBookmark error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Create a new Work (metadata only)
exports.createWork = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title,
      summary = '',
      rating = 'notrated',
      warnings = [],
      fandoms = [],
      relationships = [],
      characters = [],
      tags = [],
      language = 'English',
      completionStatus = 'in_progress',
      chaptersTotal = 0,
      coverImage = '',
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const work = await Work.create({
      author: userId,
      title: String(title).trim(),
      summary: String(summary || ''),
      rating,
      warnings: Array.isArray(warnings) ? warnings : parseCsv(warnings),
      fandoms: Array.isArray(fandoms) ? fandoms : parseCsv(fandoms),
      relationships: Array.isArray(relationships) ? relationships : parseCsv(relationships),
      characters: Array.isArray(characters) ? characters : parseCsv(characters),
      tags: Array.isArray(tags) ? tags : parseCsv(tags),
      language,
      completionStatus,
      chaptersTotal: parseInt(chaptersTotal, 10) || 0,
      coverImage: String(coverImage || ''),
    });

    return res.status(201).json(work);
  } catch (err) {
    console.error('createWork error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Add a chapter to a work and update counters
exports.addChapter = async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user.id;
    const { number, title = '', content = '', words, chaptersTotal } = req.body || {};

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: 'Work not found' });
    if (String(work.author) !== String(userId)) return res.status(403).json({ message: 'Not owner' });

    const chapterNumber = parseInt(number, 10) || 1;
    const text = String(content || '');
    const wordCount = Number.isFinite(parseInt(words, 10)) ? parseInt(words, 10) : (text.trim() ? text.trim().split(/\s+/).length : 0);

    const chapter = await WorkChapter.create({ work: work._id, number: chapterNumber, title, content: text, words: wordCount });

    const update = { $inc: { words: wordCount } };
    if (chapterNumber > (work.chaptersCount || 0)) {
      update.$set = { ...(update.$set || {}), chaptersCount: chapterNumber };
    }
    if (chaptersTotal !== undefined) {
      const ct = parseInt(chaptersTotal, 10) || 0;
      update.$set = { ...(update.$set || {}), chaptersTotal: ct };
    }
    await Work.updateOne({ _id: work._id }, update);

    return res.status(201).json(chapter);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Chapter number already exists' });
    }
    console.error('addChapter error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Facets for discoverability (top values)
exports.facets = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const pipeline = [
      {
        $facet: {
          ratings: [
            { $group: { _id: '$rating', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          languages: [
            { $group: { _id: '$language', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          fandoms: [
            { $unwind: '$fandoms' },
            { $group: { _id: '$fandoms', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: limit },
          ],
          relationships: [
            { $unwind: '$relationships' },
            { $group: { _id: '$relationships', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: limit },
          ],
          characters: [
            { $unwind: '$characters' },
            { $group: { _id: '$characters', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: limit },
          ],
          tags: [
            { $unwind: '$tags' },
            { $group: { _id: '$tags', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: limit },
          ],
        },
      },
    ];

    const [result] = await Work.aggregate(pipeline);
    return res.json(result || {});
  } catch (err) {
    console.error('facets error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Handle cover image upload (multer places file on req.file)
exports.uploadCover = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    // Upload to Cloudinary and return hosted URL
    if (!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
      return res.status(500).json({ message: 'Image storage not configured' });
    }
    const orig = req.file.originalname || 'cover.jpg';
    const base = orig.split('.').slice(0, -1).join('.') || 'cover';
    const result = await uploadCoverBufferToCloudinary(req.file.buffer, `${Date.now()}_${base}`);
    const url = result?.secure_url || '';
    return res.status(201).json({ url });
  } catch (err) {
    console.error('uploadCover error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// List chapters metadata (number and title) without incrementing hits
exports.listChapters = async (req, res) => {
  try {
    const { workId } = req.params;
    const chapters = await WorkChapter.find({ work: workId }).sort({ number: 1 }).select('number title words createdAt updatedAt');
    return res.json({ chapters });
  } catch (err) {
    console.error('listChapters error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Return the entire work content (all chapters) and increment hits once
exports.getEntireWork = async (req, res) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: 'Work not found' });
    const chapters = await WorkChapter.find({ work: workId }).sort({ number: 1 });
    return res.json({ workId, chapters });
  } catch (err) {
    console.error('getEntireWork error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Update work (author-only)
exports.updateWork = async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user && req.user.id;
    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: 'Work not found' });
    if (!userId || String(work.author) !== String(userId)) {
      return res.status(403).json({ message: 'Not owner' });
    }
    const allowed = ['title', 'summary', 'chaptersTotal', 'coverImage', 'rating', 'language', 'completionStatus'];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
        work[k] = req.body[k];
      }
    }
    await work.save();
    const populated = await Work.findById(work._id).populate('author', 'username');
    return res.json(populated);
  } catch (err) {
    console.error('updateWork error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Delete work (author-only)
exports.deleteWork = async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user && req.user.id;
    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: 'Work not found' });
    if (!userId || String(work.author) !== String(userId)) {
      return res.status(403).json({ message: 'Not owner' });
    }
    await WorkChapter.deleteMany({ work: work._id });
    await WorkBookmark.deleteMany({ work: work._id });
    await WorkKudos.deleteMany({ work: work._id });
    await Work.deleteOne({ _id: work._id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteWork error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Update chapter (author-only)
exports.updateChapter = async (req, res) => {
  try {
    const { workId, number } = req.params;
    const userId = req.user && req.user.id;
    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: 'Work not found' });
    if (!userId || String(work.author) !== String(userId)) {
      return res.status(403).json({ message: 'Not owner' });
    }
    const currentNumber = parseInt(number, 10) || 1;
    const chapter = await WorkChapter.findOne({ work: work._id, number: currentNumber });
    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    const nextTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title') ? String(req.body.title || '') : chapter.title;
    const nextContent = Object.prototype.hasOwnProperty.call(req.body || {}, 'content') ? String(req.body.content || '') : chapter.content;
    const providedWords = Object.prototype.hasOwnProperty.call(req.body || {}, 'words') ? parseInt(req.body.words, 10) : null;
    const nextWords = Number.isFinite(providedWords) && providedWords != null ? providedWords : (nextContent.trim() ? nextContent.trim().split(/\s+/).length : 0);

    const delta = nextWords - (chapter.words || 0);
    chapter.title = nextTitle;
    chapter.content = nextContent;
    chapter.words = nextWords;

    // Handle renumbering if requested
    const renumberTo = req.body && req.body.renumberTo != null ? parseInt(req.body.renumberTo, 10) : null;
    if (renumberTo && renumberTo !== currentNumber) {
      const exists = await WorkChapter.findOne({ work: work._id, number: renumberTo });
      if (exists) return res.status(409).json({ message: 'Target chapter number already exists' });
      chapter.number = renumberTo;
    }

    await chapter.save();
    if (delta) {
      await Work.updateOne({ _id: work._id }, { $inc: { words: delta } });
    }
    // Adjust chaptersCount if needed
    const maxCh = await WorkChapter.find({ work: work._id }).sort({ number: -1 }).limit(1);
    const highest = maxCh && maxCh[0] ? maxCh[0].number : 0;
    if ((work.chaptersCount || 0) !== highest) {
      await Work.updateOne({ _id: work._id }, { $set: { chaptersCount: highest } });
    }

    return res.json(chapter);
  } catch (err) {
    console.error('updateChapter error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Delete chapter (author-only)
exports.deleteChapter = async (req, res) => {
  try {
    const { workId, number } = req.params;
    const userId = req.user && req.user.id;
    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: 'Work not found' });
    if (!userId || String(work.author) !== String(userId)) {
      return res.status(403).json({ message: 'Not owner' });
    }
    const currentNumber = parseInt(number, 10) || 1;
    const chapter = await WorkChapter.findOne({ work: work._id, number: currentNumber });
    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    const words = chapter.words || 0;
    await chapter.deleteOne();
    if (words) await Work.updateOne({ _id: work._id }, { $inc: { words: -words } });

    const maxCh = await WorkChapter.find({ work: work._id }).sort({ number: -1 }).limit(1);
    const highest = maxCh && maxCh[0] ? maxCh[0].number : 0;
    await Work.updateOne({ _id: work._id }, { $set: { chaptersCount: highest } });

    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteChapter error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Record a lifetime-unique hit: increments hitsCount only on first unique (user or anon)
exports.recordHit = async (req, res) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId).select('_id');
    if (!work) return res.status(404).json({ message: 'Work not found' });

    // Optional auth: accept x-auth-token or Authorization: Bearer
    let userId = (req.user && req.user.id) || null;
    try {
      if (!userId) {
        const bearer = (req.headers && req.headers.authorization) || '';
        const tokenHeader = req.header && req.header('x-auth-token');
        const token = (bearer && bearer.startsWith('Bearer ')) ? bearer.slice(7) : tokenHeader;
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded && decoded.id) userId = decoded.id;
        }
      }
    } catch {}

    const anonId = req.body && typeof req.body.anonId === 'string' ? req.body.anonId : null;
    if (!userId && !anonId) {
      // Without any identifier, treat as no-op
      return res.json({ ok: true, deduped: true });
    }

    // If user is present, merge any prior anon hit and avoid double counting
    if (userId) {
      // Already has a user hit?
      const existingUser = await WorkHit.findOne({ work: work._id, user: userId });
      if (existingUser) return res.json({ ok: true, deduped: true });
      // Promote anon -> user if anonId provided
      if (anonId) {
        const promoted = await WorkHit.findOneAndUpdate(
          { work: work._id, anonId },
          { $set: { user: userId }, $unset: { anonId: '' } },
          { new: true }
        );
        if (promoted) return res.json({ ok: true, deduped: true });
      }
      // Create first-time user hit and increment
      await WorkHit.create({ work: work._id, user: userId });
      await Work.updateOne({ _id: work._id }, { $inc: { hitsCount: 1 } });
      return res.json({ ok: true, deduped: false });
    }

    // Anonymous path: create if not exists
    const existingAnon = await WorkHit.findOne({ work: work._id, anonId });
    if (existingAnon) return res.json({ ok: true, deduped: true });
    await WorkHit.create({ work: work._id, anonId });
    await Work.updateOne({ _id: work._id }, { $inc: { hitsCount: 1 } });
    return res.json({ ok: true, deduped: false });
  } catch (err) {
    console.error('recordHit error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
