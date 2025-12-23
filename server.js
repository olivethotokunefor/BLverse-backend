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
   CORS (FIXED & SIMPLIFIED)
   ========================= */

const allowedOrigins = [
  'https://bl-verse.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, mobile apps)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check wildcard domains
    try {
      const url = new URL(origin);
      if (url.hostname.endsWith('.netlify.app') || url.hostname.endsWith('.vercel.app')) {
        return callback(null, true);
      }
    } catch (e) {}
    
    // Log blocked origins for debugging
    console.warn('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Must match frontend credentials: 'include'
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['x-auth-token'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* =========================
   MIDDLEWARE
   ========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  console.log('Connected to MongoDB');
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.error('MongoDB disconnected');
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
  res.send('BLverse API is running');
});

/* =========================
   ERROR HANDLER
   ========================= */

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

/* =========================
   SOCKET.IO
   ========================= */

const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    credentials: true,
  },
});

setIO(io);

io.on('connection', (socket) => {
  socket.on('join_conversation', (conversationId) => {
    if (conversationId) socket.join(String(conversationId));
  });

  socket.on('join_user', (userId) => {
    if (userId) socket.join(String(userId));
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
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
