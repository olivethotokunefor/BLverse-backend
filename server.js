require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const { setIO } = require("./realtime/io");

const app = express();
const server = http.createServer(app);

/* =========================
   TRUST PROXY
========================= */
app.set("trust proxy", 1);

/* =========================
   CORS (FIXED + SAFE)
========================= */
const allowedOrigins = [
  "http://localhost:5173",
  "https://bl-verse.netlify.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman / curl
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Blocked by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// 🔑 PRE-FLIGHT HANDLER (DO NOT REMOVE)
app.options("*", cors());

/* =========================
   BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC UPLOADS
========================= */
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

/* =========================
   DATABASE
========================= */
mongoose.set("bufferCommands", false);

mongoose.connection.on("connected", () =>
  console.log("✅ Connected to MongoDB")
);
mongoose.connection.on("error", (err) =>
  console.error("❌ MongoDB error:", err)
);
mongoose.connection.on("disconnected", () =>
  console.warn("⚠️ MongoDB disconnected")
);

/* =========================
   ROUTES
========================= */
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const communityRoutes = require("./routes/community");
const worksRoutes = require("./routes/works");
const mediaRoutes = require("./routes/media");
const readingProgressRoutes = require("./routes/readingProgress");
const dramaRoutes = require("./routes/dramas");
const storyRoutes = require("./routes/stories");
const shipRoutes = require("./routes/ships");
const merchRoutes = require("./routes/merch");
const messageRoutes = require("./routes/messages");
const newsRoutes = require("./routes/news");
const aiChatRoutes = require("./routes/aiChat");
const notificationsRoutes = require("./routes/notifications");
const linkRoutes = require("./routes/link");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/works", worksRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/reading-progress", readingProgressRoutes);
app.use("/api/dramas", dramaRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/ships", shipRoutes);
app.use("/api/merch", merchRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/ai-chat", aiChatRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/link", linkRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "BLverse API is running",
    timestamp: new Date().toISOString(),
  });
});

/* =========================
   ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

/* =========================
   SOCKET.IO (MATCHES CORS)
========================= */
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

setIO(io);

io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  socket.on("join_conversation", (id) => id && socket.join(String(id)));
  socket.on("join_user", (id) => id && socket.join(String(id)));

  socket.on("disconnect", () => {
    console.log("🔌 Socket disconnected:", socket.id);
  });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();
