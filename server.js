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

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://bl-verse.netlify.app',
  'http://bl-verse.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);
const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  try {
    const host = new URL(origin).hostname;
    if (/\.netlify\.app$/.test(host)) return callback(null, true);
  } catch {}
  return callback(null, false);
};
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Static file hosting for uploaded images
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Database connection
mongoose.set('bufferCommands', false);

mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.error('MongoDB disconnected');
});

function mountRoutes() {
  const authRoutes = require('./routes/auth');
  const userRoutes = require('./routes/users');
  const communityRoutes = require('./routes/community');
  const worksRoutes = require('./routes/works');
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
  app.use('/api/users', userRoutes);
  app.use('/api/community', communityRoutes);
  app.use('/api/works', worksRoutes);
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
}

// Basic route
app.get('/', (req, res) => {
  res.send('BLverse API is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  },
});
setIO(io);

io.on('connection', (socket) => {
  // Token can be provided as handshake auth or query; controllers will emit to rooms
  const token = (socket.handshake.auth && socket.handshake.auth.token) || (socket.handshake.query && socket.handshake.query.token);
  // We don't verify token here; REST endpoints enforce auth and emit to rooms/users by id
  socket.on('join_conversation', (conversationId) => {
    if (conversationId) socket.join(String(conversationId));
  });
  socket.on('join_user', (userId) => {
    if (userId) socket.join(String(userId));
  });
});

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blverse';
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    // Only mount routes after DB connection so models don't buffer queries during startup
    mountRoutes();

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
