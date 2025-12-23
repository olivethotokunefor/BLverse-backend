const express = require('express');
const http = require('http');
const https = require('https');

const router = express.Router();

const cache = new Map();

function fetchUrlRaw(url) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + (u.search || ''),
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BLverseBot/1.0; +https://example.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'identity',
          },
          timeout: 10000,
        },
        (res) => {
          const status = res.statusCode || 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            const redirected = new URL(res.headers.location, url).toString();
            res.resume();
            return resolve(fetchUrlRaw(redirected));
          }
          if (status < 200 || status >= 400) {
            res.resume();
            return reject(new Error('Bad status: ' + status));
          }
          const chunks = [];
          let total = 0;
          const max = 256 * 1024;
          res.on('data', (d) => {
            total += d.length;
            if (total <= max) chunks.push(d);
            else res.destroy();
          });
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            resolve(buf.toString('utf8'));
          });
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function extractMeta(html) {
  const get = (re) => {
    const m = html.match(re);
    return m ? m[1].trim() : '';
  };
  const title = get(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    get(/<meta[^>]+name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    get(/<title[^>]*>([^<]+)<\/title>/i);
  const description = get(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    get(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    get(/<meta[^>]+name=["']twitter:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const image = get(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    get(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const siteName = get(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return { title, description, image, siteName };
}

router.get('/preview', async (req, res) => {
  try {
    const url = String(req.query.url || '').trim();
    if (!url) return res.status(400).json({ error: 'url required' });
    const u = new URL(url, 'http://localhost');
    if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ error: 'invalid protocol' });

    const key = u.toString();
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return res.json(cached.data);

    const raw = await fetchUrlRaw(key);
    const meta = extractMeta(raw || '');
    const result = {
      url: key,
      title: meta.title || key,
      description: meta.description || '',
      image: meta.image || '',
      siteName: meta.siteName || u.hostname,
      domain: u.hostname,
    };
    cache.set(key, { data: result, expires: Date.now() + 6 * 60 * 60 * 1000 });
    res.json(result);
  } catch (e) {
    res.status(200).json({ url: String(req.query.url || ''), title: String(req.query.url || ''), description: '', image: '', siteName: '', domain: '' });
  }
});

module.exports = router;
