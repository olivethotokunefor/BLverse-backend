const AiChatSession = require('../models/AiChatSession');

const MAX_MESSAGES = 200;

function sanitizeMessage(msg) {
  const role = msg && msg.role === 'assistant' ? 'assistant' : 'user';
  const content = msg && typeof msg.content === 'string' ? msg.content : '';
  const results = Array.isArray(msg?.results) ? msg.results : undefined;

  const cleanResults = results
    ? results
        .map((r) => ({
          id: Number(r.id),
          name: typeof r.name === 'string' ? r.name : '',
          original_name: typeof r.original_name === 'string' ? r.original_name : '',
          poster_path: typeof r.poster_path === 'string' ? r.poster_path : '',
          first_air_date: typeof r.first_air_date === 'string' ? r.first_air_date : '',
        }))
        .filter((r) => Number.isFinite(r.id))
    : undefined;

  return {
    role,
    content: content.trim(),
    results: cleanResults && cleanResults.length ? cleanResults : undefined,
    createdAt: new Date(),
  };
}

// GET /api/ai-chat
exports.getSession = async (req, res) => {
  try {
    const session = await AiChatSession.findOne({ user: req.user.id }).lean();
    res.json({ messages: session?.messages || [] });
  } catch (e) {
    console.error('getSession error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/ai-chat/messages { role, content, results? }
exports.appendMessage = async (req, res) => {
  try {
    const msg = sanitizeMessage(req.body || {});
    if (!msg.content) return res.status(400).json({ message: 'content is required' });

    const session = await AiChatSession.findOneAndUpdate(
      { user: req.user.id },
      {
        $setOnInsert: { user: req.user.id },
        $push: { messages: { $each: [msg], $slice: -MAX_MESSAGES } },
      },
      { new: true, upsert: true }
    ).lean();

    res.status(201).json({ messages: session?.messages || [] });
  } catch (e) {
    console.error('appendMessage error', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/ai-chat
exports.clearSession = async (req, res) => {
  try {
    await AiChatSession.deleteOne({ user: req.user.id });
    res.json({ ok: true });
  } catch (e) {
    console.error('clearSession error', e);
    res.status(500).json({ message: 'Server error' });
  }
};
