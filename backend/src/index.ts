import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { registerRouter } from "./register.js";
import { loginRouter } from "./login.js";
import { chatRouter } from "./chat.js";
import { usersRouter } from "./users.js";
import { sessionRouter } from "./session.js";
import { adminRouter } from "./admin.js";
import adminAuthRouter from "./adminAuth.js";
import { cleanupInactiveSessions } from "./session.js";
import { connectDB } from "./db.js";
import { initSocketServer } from "./socketServer.js";
import { startArchiveCron } from "./p2/cron.js";

import path from "path";
//import { uploadRouter } from "./upload.js";

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);

      // check if origin is explicitly allowed or matches local dev environments
      if (
        allowedOrigins.includes(origin) ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return callback(null, origin);
      }
      return callback(null, origin);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get(["/", "/api/health"], (req, res) => {
  res.json({ status: "ok", message: "TencentRTC Backend API is running" });
});

app.use(registerRouter);
app.use(loginRouter);
app.use(usersRouter);
app.use("/api/session", sessionRouter);
// Mount administrator authentication before routes protected by requireAdmin.
app.use("/api/admin", adminAuthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/chat", chatRouter);
// app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
// app.use(uploadRouter);

// Global JSON error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON format in request body" });
  }
  console.error("Backend request error:", err);
  return res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ─── Boot sequence ───────────────────────────────────────────────────────────
(async () => {
  // 1. DB connection (exits process on failure)
  await connectDB();

  // 2. Wrap Express in a raw HTTP server so Socket.io can share the same port
  const httpServer = createServer(app);

  // 3. Attach Socket.io to the HTTP server (must happen before listen)
  initSocketServer(httpServer);

  // 4. Start listening
  httpServer.listen(PORT, () => {
    const env  = process.env.NODE_ENV ?? "development";
    const now  = new Date().toLocaleString();

    console.log("\x1b[35m\x1b[1m╔══════════════════════════════════════╗");
    console.log("\x1b[35m\x1b[1m║      TencentRTC Backend  🚀          ║");
    console.log("\x1b[35m\x1b[1m╚══════════════════════════════════════╝\x1b[0m");
    console.log(`\x1b[36m\x1b[1m[SERVER]\x1b[0m Listening on  \x1b[32mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[36m\x1b[1m[SERVER]\x1b[0m Environment   \x1b[33m${env}\x1b[0m`);
    console.log(`\x1b[36m\x1b[1m[SERVER]\x1b[0m Started at    \x1b[2m${now}\x1b[0m`);
    if (env === "development") {
      console.log(`\x1b[2m         Set DB_QUERY_LOG=true to enable per-query logs\x1b[0m`);
    }
    console.log("");

    // Register the Phase 2B daily archive safety net once the server is listening.
    startArchiveCron();
  });

  // 5. Start global inactivity cleanup (runs every 60s)
  //    Finds ACTIVE sessions idle for > 3 min, ends them, notifies users via socket.
  //    Also run once immediately to clear any zombies from a previous server crash.
  cleanupInactiveSessions().catch((e) =>
    console.warn("[Inactivity] Initial cleanup error:", e)
  );
  const CLEANUP_INTERVAL_MS = 60 * 1000; // Every 60 seconds
  setInterval(() => {
    cleanupInactiveSessions().catch((e) =>
      console.warn("[Inactivity] Cleanup error:", e)
    );
  }, CLEANUP_INTERVAL_MS);
  console.log(
    `\x1b[36m[Inactivity]\x1b[0m Zombie cleanup scheduled every \x1b[33m${CLEANUP_INTERVAL_MS / 1000}s\x1b[0m (3 min idle limit)\n`
  );

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\x1b[31m\x1b[1m[SERVER ERROR]\x1b[0m Port ${PORT} is already in use by another process.`);
      console.error(`\x1b[33mTip:\x1b[0m Stop the other process or kill it using: \x1b[36mfuser -k ${PORT}/tcp\x1b[0m or \x1b[36mnpx kill-port ${PORT}\x1b[0m\n`);
    } else {
      console.error(`\x1b[31m\x1b[1m[SERVER ERROR]\x1b[0m`, err);
    }
    process.exit(1);
  });
})();
