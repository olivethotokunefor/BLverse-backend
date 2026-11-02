const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// TMDB proxy — keeps the API key server-side, out of the browser bundle
// GET /api/tmdb/search?query=...
router.get('/search', protect, async (req, res) => {
  try {
    const key = process.env.TMDB_API_KEY;
    if (!key) return res.status(503).json({ message: 'TMDB not configured' });

    const query = (req.query.query || '').toString().trim();
    if (!query) return res.json({ results: [] });

    const url = `https://api.themoviedb.org/3/search/tv?api_key=${key}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`TMDB responded ${upstream.status}`);

    const data = await upstream.json();
    res.json({ results: data.results || [] });
  } catch (e) {
    console.error('tmdb /search error', e.message);
    res.status(502).json({ message: 'Failed to fetch from TMDB' });
  }
});

// GET /api/tmdb/discover — BL drama discovery (no query needed)
router.get('/discover', protect, async (req, res) => {
  try {
    const key = process.env.TMDB_API_KEY;
    if (!key) return res.status(503).json({ message: 'TMDB not configured' });

    const url = `https://api.themoviedb.org/3/discover/tv?api_key=${key}&with_genres=18,10749&with_original_language=th|ko|ja|zh|tl&sort_by=popularity.desc`;
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`TMDB responded ${upstream.status}`);

    const data = await upstream.json();
    res.json({ results: data.results || [] });
  } catch (e) {
    console.error('tmdb /discover error', e.message);
    res.status(502).json({ message: 'Failed to fetch from TMDB' });
  }
});

// GET /api/tmdb/details/:id
router.get('/details/:id', protect, async (req, res) => {
  try {
    const key = process.env.TMDB_API_KEY;
    if (!key) return res.status(503).json({ message: 'TMDB not configured' });

    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) return res.status(400).json({ message: 'Invalid TMDB id' });

    const url = `https://api.themoviedb.org/3/tv/${id}?api_key=${key}&language=en-US`;
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`TMDB responded ${upstream.status}`);

    const data = await upstream.json();
    res.json(data);
  } catch (e) {
    console.error('tmdb /details error', e.message);
    res.status(502).json({ message: 'Failed to fetch from TMDB' });
  }
});

module.exports = router;

