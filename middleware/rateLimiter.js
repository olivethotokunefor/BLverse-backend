const rateLimit = require('express-rate-limit');

// Helper: build a standard rate limiter
const make = (windowMinutes, max, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    message: { message },
    // Use the real client IP even behind Render/Netlify proxy (server.js sets trust proxy)
    keyGenerator: (req) => req.ip,
  });

// Strict: login / register — prevent brute-force & spam accounts
exports.authStrict = make(15, 10, 'Too many attempts. Please wait 15 minutes and try again.');

// Moderate: resend verification, password reset
exports.authModerate = make(60, 5, 'Too many requests. Please wait an hour before trying again.');

// General API abuse prevention (applied globally)
exports.apiGeneral = make(1, 120, 'Too many requests. Please slow down.');

// Community posting — prevent spam
exports.communityPost = make(1, 20, 'You\'re posting too fast. Please slow down.');

// Ship voting — per-minute cap
exports.shipVote = make(1, 30, 'Too many votes. Please slow down.');

// AI chat — expensive endpoint, limit harder
exports.aiChat = make(1, 15, 'Too many AI requests. Please wait a minute.');

