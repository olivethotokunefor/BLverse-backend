const { XMLParser } = require('fast-xml-parser');
// Ensure fetch is available on Node < 18
let fetchAny;
try {
  if (typeof fetch === 'function') {
    fetchAny = (...args) => fetch(...args);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeFetch = require('node-fetch');
    fetchAny = (...args) => nodeFetch(...args);
  }
} catch (_) {
  // Fallback: attempt dynamic require
  try {
    const nodeFetch = require('node-fetch');
    fetchAny = (...args) => nodeFetch(...args);
  } catch {}
}
// Simple in-memory cache for articles
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let NEWS_CACHE = { at: 0, articles: [] };

async function fetchText(url) {
  const res = await fetchAny(url, { headers: { 'User-Agent': 'BLverseBot/1.0 (+https://example.com)' } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

function parseRss(xmlText) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const json = parser.parse(xmlText);
  // Try standard RSS shape
  const channel = json?.rss?.channel || json?.feed;
  if (!channel) return [];
  const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
  return items;
}

function extractImage(item) {
  // enclosure url
  if (item?.enclosure && (item.enclosure['@_url'] || item.enclosure.url)) {
    return item.enclosure['@_url'] || item.enclosure.url;
  }
  // media:content or content
  const media = item['media:content'] || item.content || item['content:encoded'];
  if (media && (media['@_url'] || media.url)) return media['@_url'] || media.url;
  // description/content HTML: try src, data-src, or first srcset URL
  const desc = item.description || item['content:encoded'] || '';
  if (typeof desc === 'string') {
    const src = desc.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
    if (src && src[1]) return src[1];
    const srcset = desc.match(/<img[^>]+srcset=["']([^"']+)["']/i);
    if (srcset && srcset[1]) {
      const first = srcset[1].split(',')[0].trim().split(' ')[0];
      if (first) return first;
    }
  }
  return null;
}

function normalizeUrl(url, base) {
  try {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (!/^https?:\/\//i.test(url) && base) return new URL(url, base).toString();
    return url;
  } catch (_) {
    return url;
  }
}

async function tryOgImage(url) {
  try {
    const html = await fetchText(url);
    const og1 = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (og1 && og1[1]) return og1[1];
    const og2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (og2 && og2[1]) return og2[1];
  } catch (_) {
    // ignore
  }
  return null;
}

function mapItems(items, sourceLabel) {
  return items.map((it, idx) => {
    const title = it.title || 'Untitled';
    const link = it.link || (it.guid && it.guid['#text']) || '';
    const pubDate = it.pubDate || it.published || new Date().toISOString();
    const description = it.description || it.summary || it['content:encoded'] || '';
    let image_url = normalizeUrl(extractImage(it), link);
    return {
      id: `${sourceLabel}-${idx}`,
      title,
      description,
      content: description,
      pubDate,
      link,
      image_url,
      source: sourceLabel,
    };
  });
}

exports.scrapeNews = async (req, res) => {
  try {
    const force = (req.query && (req.query.force === '1' || req.query.force === 'true')) ? true : false;
    // Serve from cache when fresh (unless force bypass)
    if (!force && Date.now() - NEWS_CACHE.at < CACHE_TTL_MS && Array.isArray(NEWS_CACHE.articles) && NEWS_CACHE.articles.length) {
      return res.json({ articles: NEWS_CACHE.articles });
    }
    const sources = [
      { url: 'https://the-bl-xpress.com/feed/', label: 'The BL Xpress' },
      { url: 'https://boysloveinsider.com/feed/', label: 'BoysLoveInsider' },
    ];

    const results = await Promise.allSettled(
      sources.map(async (s) => {
        const xml = await fetchText(s.url);
        const items = parseRss(xml);
        return mapItems(items, s.label);
      })
    );

    const articles = [];
    for (const r of results) {
      if (r.status === 'fulfilled') articles.push(...r.value);
    }
    // Prefer og:image for BoysLoveInsider items (hotlink protection)
    for (const art of articles) {
      if (art.source === 'BoysLoveInsider' && art.link) {
        const og = await tryOgImage(art.link);
        if (og) {
          art.image_url = normalizeUrl(og, art.link);
        }
      }
    }
    // Prefer og:image for The BL Xpress items as well (CDN/hotlink issues)
    for (const art of articles) {
      if (art.source === 'The BL Xpress' && art.link) {
        const og = await tryOgImage(art.link);
        if (og) {
          art.image_url = normalizeUrl(og, art.link);
        }
      }
    }
    // Fill a few missing images using og:image from the article page
    let filled = 0;
    for (const art of articles) {
      if (!art.image_url && art.link && filled < 8) {
        const og = await tryOgImage(art.link);
        if (og) {
          art.image_url = normalizeUrl(og, art.link);
          filled++;
        }
      }
      if (filled >= 8) break;
    }
    articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // Update cache
    NEWS_CACHE = { at: Date.now(), articles };
    res.json({ articles });
  } catch (err) {
    console.error('scrapeNews error', err);
    res.status(500).json({ message: 'Failed to scrape news' });
  }
};

// Proxy remote images to bypass hotlink protection and referrer checks
exports.proxyImage = async (req, res) => {
  try {
    const url = req.query.url;
    const ref = req.query.ref;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'Missing url' });
    }
    const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();
    const referer = (typeof ref === 'string' && ref) ? ref : origin;
    const upstream = await fetchAny(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }
    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.status(500).end();
  }
};
