const express = require('express');
const https = require('https');
const zlib = require('zlib');

const router = express.Router();

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    try {
      https
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // follow redirects
            return resolve(fetchHtml(res.headers.location));
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Request failed with ${res.statusCode}`));
            return;
          }
          const enc = (res.headers['content-encoding'] || '').toLowerCase();
          let stream = res;
          if (enc.includes('br')) {
            stream = res.pipe(zlib.createBrotliDecompress());
          } else if (enc.includes('gzip')) {
            stream = res.pipe(zlib.createGunzip());
          } else if (enc.includes('deflate')) {
            stream = res.pipe(zlib.createInflate());
          }
          let data = '';
          stream.on('data', (chunk) => (data += chunk.toString('utf8')));
          stream.on('end', () => resolve(data));
          stream.on('error', reject);
        })
        .on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseWeekly(html) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const result = {};
  const lower = html.toLowerCase();

  function findWordIndex(text, word) {
    const w = word.toLowerCase();
    let i = 0;
    while (i >= 0) {
      i = text.indexOf(w, i);
      if (i < 0) return -1;
      const before = i > 0 ? text[i - 1] : ' ';
      const after = i + w.length < text.length ? text[i + w.length] : ' ';
      const isBoundaryBefore = !/[a-z]/.test(before);
      const isBoundaryAfter = !/[a-z]/.test(after);
      if (isBoundaryBefore && isBoundaryAfter) return i;
      i = i + w.length;
    }
    return -1;
  }

  // build day anchors by first occurrence of the word
  const anchors = [];
  for (const d of days) {
    let idx = -1;
    // try header tags first for accuracy
    const re = new RegExp(`<h[1-6][^>]*>[^<]*${d}[^<]*<\\/h[1-6]>`, 'i');
    const m = re.exec(html);
    if (m && typeof m.index === 'number') {
      idx = m.index;
    } else {
      idx = findWordIndex(lower, d);
    }
    if (idx >= 0) anchors.push({ day: d, index: idx });
  }

  anchors.sort((a, b) => a.index - b.index);
  if (anchors.length === 0) return {};

  for (let i = 0; i < anchors.length; i++) {
    const { day, index } = anchors[i];
    const end = i + 1 < anchors.length ? anchors[i + 1].index : html.length;
    const segment = html.slice(index, end);
    const items = [];

    // Primary: Tables (new structure)
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    const tableItems = [];
    while ((tableMatch = tableRe.exec(segment))) {
      const tableBody = tableMatch[1];
      // Find rows (skip header if present)
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      while ((rowMatch = rowRe.exec(tableBody))) {
        const row = rowMatch[1];
        // Skip header rows that use <th>
        if (/\<th\b/i.test(row)) continue;
        // Get cells
        const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let cellMatch;
        let firstCellRaw = '';
        while ((cellMatch = cellRe.exec(row))) {
          const cellHtml = cellMatch[1];
          if (firstCellRaw === '') firstCellRaw = cellHtml;
          cells.push(stripTags(cellHtml));
        }
        if (cells.length >= 1) {
          // Extract anchor if present in first cell
          const a = /<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(firstCellRaw || '');
          const derivedTitle = a ? stripTags(a[2]) : (cells[0] || '').trim();
          const link = a ? a[1] : undefined;
          const title = (derivedTitle || '').trim();
          if (title && title.length > 1) {
            const extra = cells.length > 1 ? (cells[1] || '').trim() : undefined;
            if (!(link && /\/category\//i.test(link))) {
              tableItems.push({ title, extra, link });
            }
          }
        }
      }
    }
    if (tableItems.length > 0) {
      items.push(...tableItems);
    }

    // Prefer <li> blocks
    if (items.length === 0) {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let m;
      while ((m = liRe.exec(segment))) {
        const raw = m[1];
        const a = /<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(raw);
        const title = a ? stripTags(a[2]) : stripTags(raw);
        const link = a ? a[1] : undefined;
        if (!title) continue;
        if (link && /\/category\//i.test(link)) continue;
        items.push({ title, link });
      }
    }

    // Fallback: paragraphs with anchors
    if (items.length === 0) {
      const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let m;
      while ((m = pRe.exec(segment))) {
        const raw = m[1];
        const a = /<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(raw);
        const title = a ? stripTags(a[2]) : stripTags(raw);
        const link = a ? a[1] : undefined;
        if (!title || title.length < 3) continue;
        if (link && /\/category\//i.test(link)) continue;
        items.push({ title, link });
      }
    }

    result[day] = items;
  }
  return result;
}

let CACHE = { at: 0, data: null };

router.get('/bl-weekly', async (req, res) => {
  const source = 'https://boysloveinsider.com/weekly-bl-schedule/';
  try {
    const now = Date.now();
    const ttlMs = 1000 * 60 * 30; // 30 minutes cache
    const noCache = String(req.query.nocache || '') === '1';
    if (!noCache && CACHE.data && now - CACHE.at < ttlMs) {
      return res.json({ source, cached: true, fetchedAt: new Date(CACHE.at).toISOString(), days: CACHE.data, ok: true });
    }
    const html = await fetchHtml(source);
    const days = parseWeekly(html);
    CACHE = { at: now, data: days };
    res.json({ source, fetchedAt: new Date().toISOString(), days, ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e && e.message) || 'failed to fetch', source });
  }
});

module.exports = router;
