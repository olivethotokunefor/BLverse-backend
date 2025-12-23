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

/* =========================
   CORS (PXXL-SPECIFIC FIX)
   ========================= */

// Critical for pxxl reverse proxy
app.set('trust proxy', true);
app.enable('trust proxy');

// Pre-flight and CORS handler
app.use((req, res, next) => {
  const origin = req.headers.origin || req.headers.referer;
  
  // Allow your frontend
  if (origin && origin.includes('bl-verse.netlify.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token');
  res.setHeader('Access-Control-Expose-Headers', 'x-auth-token');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

/* =========================
   MIDDLEWARE
   ========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware (remove after fixing)
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} from ${req.headers.origin || 'no origin'}`);
  next();
});

/* =========================
   STATIC UPLOADS
   ========================= */

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

/* =========================
   DATABASE
   ========================= */

mongoose.set('bufferCommands', false);

mongoose.connection.on('connected', () => {
  console.log('✅ Connected to MongoDB');
});
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.error('⚠️ MongoDB disconnected');
});

/* =========================
   ROUTES
   ========================= */

function mountRoutes() {
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
  app.use('/auth', authRoutes); // backward compatibility

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
}

/* =========================
   HEALTH CHECK
   ========================= */

app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'BLverse API is running',
    timestamp: new Date().toISOString()
  });
});

/* =========================
   ERROR HANDLER
   ========================= */

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

/* =========================
   SOCKET.IO
   ========================= */

const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

setIO(io);

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  
  socket.on('join_conversation', (conversationId) => {
    if (conversationId) socket.join(String(conversationId));
  });

  socket.on('join_user', (userId) => {
    if (userId) socket.join(String(userId));
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

/* =========================
   SERVER START
   ========================= */

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blverse';
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    mountRoutes();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();