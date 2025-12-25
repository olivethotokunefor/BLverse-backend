require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const { setIO } = require('./realtime/io');

const app = express();
const server = http.createServer(app);

// Trust proxy (needed on Render/Netlify proxies for correct IPs)
app.set('trust proxy', 1);

// Build allowed origins from env and common dev/prod hosts
const extraOrigins = (process.env.CLIENT_URLS || '')
  .split(',')
  .map((s) => s && s.trim())
  .filter(Boolean);

const allowedOriginsList = [
  process.env.CLIENT_URL,
  ...extraOrigins,
  'https://bl-verse.netlify.app',
  'http://bl-verse.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

// Origin checker to allow specific subdomains (e.g., Netlify/Vercel previews)
const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // Postman/curl/no Origin
  if (allowedOriginsList.includes(origin)) return callback(null, true);
  try {
    const host = new URL(origin).hostname;
    if (/\.netlify\.app$/.test(host)) return callback(null, true);
    if (/\.vercel\.app$/.test(host)) return callback(null, true);
  } catch {}
  return callback(new Error('Blocked by CORS'));
};

// CORS middleware
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'X-Requested-With'],
  })
);

// Express 5-safe preflight handler (avoid app.options('*', ...))
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin && (allowedOriginsList.includes(origin) || (() => {
      try {
        const host = new URL(origin).hostname;
        return /\.netlify\.app$/.test(host) || /\.vercel\.app$/.test(host);
      } catch { return false; }
    })())) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, X-Requested-With');
    return res.sendStatus(204);
  }
  next();
});

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// MongoDB connection (non-blocking)
mongoose.set('bufferCommands', false);
mongoose.connection.on('connected', () => console.log('✅ Connected to MongoDB'));
mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const communityRoutes = require('./routes/community');
const worksRoutes = require('./routes/works');
const mediaRoutes = require('./routes/media');
const readingProgressRoutes = require('./routes/readingProgress');
const dramaRoutes = require('./routes/dramas');
const storyRoutes = require('./routes/stories');
const shipRoutes = require('./routes/ships');
const merchRoutes = require('./routes/merch');
const messageRoutes = require('./routes/messages');
const newsRoutes = require('./routes/news');
const aiChatRoutes = require('./routes/aiChat');
const notificationsRoutes = require('./routes/notifications');
const linkRoutes = require('./routes/link');

app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes); // backward compatible mount if frontend omits /api
app.use('/api/users', userRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/works', worksRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/reading-progress', readingProgressRoutes);
app.use('/api/dramas', dramaRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/ships', shipRoutes);
app.use('/api/merch', merchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/link', linkRoutes);

// Health
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'BLverse API is running',
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Socket.IO (mirror CORS)
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  },
});
setIO(io);

io.on('connection', (socket) => {
  const token =
    (socket.handshake.auth && socket.handshake.auth.token) ||
    (socket.handshake.query && socket.handshake.query.token);
  // REST endpoints handle auth; sockets can join rooms as needed
  socket.on('join_conversation', (conversationId) => {
    if (conversationId) socket.join(String(conversationId));
  });
  socket.on('join_user', (userId) => {
    if (userId) socket.join(String(userId));
  });
});

// Start server immediately
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Connect DB asynchronously (server remains up even if DB fails initially)
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) =>
      console.warn('⚠️ MongoDB connection failed (server still running):', err.message)
    );
} else {
  console.warn('⚠️ No MONGODB_URI provided – running without database');
}