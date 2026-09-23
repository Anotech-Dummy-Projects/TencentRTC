/*
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { authenticateJWT } from "./chat.js";

export const uploadRouter = Router();

// Ensure local uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed MIME types
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
]);

const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".zip",
  ".rar",
  ".7z",
]);

// Limits
const MAX_IMAGE_VIDEO_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;        // 50MB

// Multer storage engine
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueId = crypto.randomUUID();
    const cleanName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    cb(null, `${Date.now()}_${uniqueId.slice(0, 8)}_${cleanName}${ext}`);
  },
});

// Multer instance with 50MB absolute ceiling
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();

    const isImage = ALLOWED_IMAGE_TYPES.has(mime);
    const isVideo = ALLOWED_VIDEO_TYPES.has(mime);
    const isDoc = ALLOWED_DOCUMENT_EXTENSIONS.has(ext);

    if (isImage || isVideo || isDoc) {
      return cb(null, true);
    }

    return cb(
      new Error(
        `Unsupported file format: ${file.originalname}. Allowed: Images (JPG/PNG/WebP/GIF), Videos (MP4/WebM/MOV), and Documents (PDF/DOCX/XLSX/ZIP/etc.)`
      )
    );
  },
});

// Single unified upload handler
uploadRouter.post(
  ["/api/upload", "/upload"],
  authenticateJWT,
  (req, res) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "File size exceeds maximum limit (50MB maximum for documents, 10MB for media).",
          });
        }
        return res.status(400).json({
          error: err.message || "Failed to upload file.",
        });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file provided in request." });
      }

      // Check media-specific 10MB limit
      const isMedia =
        ALLOWED_IMAGE_TYPES.has(file.mimetype) ||
        ALLOWED_VIDEO_TYPES.has(file.mimetype);
      if (isMedia && file.size > MAX_IMAGE_VIDEO_SIZE) {
        // Delete uploaded file if it exceeds the 10MB media limit
        fs.unlink(file.path, () => {});
        return res.status(400).json({
          error: `Media files (images and videos) must not exceed 10MB. File is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        });
      }

      // Construct public accessible URL
      const baseUrl =
        process.env.BACKEND_URL ||
        process.env.PUBLIC_API_URL ||
        `${req.protocol}://${req.get("host")}`;
      const fileUrl = `${baseUrl}/uploads/${file.filename}`;

      return res.status(200).json({
        url: fileUrl,
        thumbnailUrl: isMedia ? fileUrl : undefined,
        mimeType: file.mimetype,
        size: file.size,
        fileName: file.originalname,
      });
    });
  }
);
*/
