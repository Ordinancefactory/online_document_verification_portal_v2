const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ACCESS_CODE = process.env.PORTAL_ACCESS_CODE;
const MAX_UPLOAD_MB = Math.max(5, Number(process.env.MAX_UPLOAD_MB || 150));
const MAX_FILE_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const DATA_DIR = path.join(__dirname, "data", "submissions");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!ACCESS_CODE || ACCESS_CODE.length < 16) {
  console.error("ERROR: Set PORTAL_ACCESS_CODE to a unique secret of at least 16 characters (see .env.example).");
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "20kb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false }));

const accessLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });
function requireAccess(req, res, next) {
  const supplied = String(req.get("x-portal-access") || "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(ACCESS_CODE);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Access code not accepted. Contact your organisation's portal administrator." });
  }
  next();
}

const allowedExt = new Set([".webm", ".mp4", ".mov", ".m4v", ".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const submissionId = req.submissionId;
    const dir = path.join(DATA_DIR, submissionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = allowedExt.has(ext) ? ext : ".bin";
    const prefix = file.fieldname === "video" ? "verification-video" :const validMime = /^(video\/(webm|mp4|quicktime)|image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)
      file.fieldname === "documents" ? "document" : "evidence";
    cb(null, `${prefix}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 11, fields: 20, fieldSize: 10000 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "").toLowerCase();
    const validExt = allowedExt.has(ext);
    const validMime =
  (mime.startsWith("image/") && ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime)) ||
  ["application/pdf", "application/x-pdf"].includes(mime) ||
  ["video/webm", "video/mp4", "video/quicktime", "video/x-m4v"].includes(mime);
    console.log("Upload MIME check:", { ext, mime, validExt, validMime });if (!validExt || !validMime) return cb(new Error("Unsupported file type. Upload a video, JPG/PNG/WebP image, or PDF."));
    cb(null, true);
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "Online Document Verification Portal" }));

app.post("/api/access-check", accessLimiter, (req, res) => {
  const supplied = String(req.body && req.body.accessCode || "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(ACCESS_CODE);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: "Access code not accepted." });
  }
  res.json({ ok: true });
});

app.post("/api/submissions", requireAccess, (req, res, next) => {
  req.submissionId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`;
  next();
}, upload.fields([{ name: "video", maxCount: 1 }, { name: "documents", maxCount: 10 }]), (req, res) => {
  try {
    const fields = req.body || {};
    const required = ["fullName", "referenceId", "documentType", "purpose", "verificationCode"];
    const missing = required.filter(k => !String(fields[k] || "").trim());
    if (missing.length) {
      removeSubmissionDir(req.submissionId);
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }
    const video = (req.files.video || [])[0];
    const documents = req.files.documents || [];
    if (!video) {
      removeSubmissionDir(req.submissionId);
      return res.status(400).json({ error: "A recorded verification video is required." });
    }
    if (!documents.length) {
      removeSubmissionDir(req.submissionId);
      return res.status(400).json({ error: "At least one supporting document is required." });
    }
    if (fields.consent !== "true" || fields.declaration !== "true") {
      removeSubmissionDir(req.submissionId);
      return res.status(400).json({ error: "Both consent declarations are required." });
    }

    const safe = value => String(value || "").trim().replace(/[<>]/g, "").slice(0, 250);
    const metadata = {
      submissionId: req.submissionId,
      submittedAt: new Date().toISOString(),
      status: "Pending review",
      applicant: {
        fullName: safe(fields.fullName),
        referenceId: safe(fields.referenceId),
        documentType: safe(fields.documentType),
        purpose: safe(fields.purpose)
      },
      verification: {
        codeReadByApplicant: safe(fields.verificationCode),
        videoRecorded: true,
        consent: true,
        accuracyDeclaration: true
      },
      files: [
        { role: "video", storedName: video.filename, originalName: safe(video.originalname), mimeType: video.mimetype, sizeBytes: video.size },
        ...documents.map(f => ({ role: "document", storedName: f.filename, originalName: safe(f.originalname), mimeType: f.mimetype, sizeBytes: f.size }))
      ]
    };
    fs.writeFileSync(path.join(DATA_DIR, req.submissionId, "submission.json"), JSON.stringify(metadata, null, 2), { flag: "wx" });
    res.status(201).json({ ok: true, submissionId: req.submissionId, status: "Pending review", message: "Submission received. Keep your reference ID for follow-up." });
  } catch (err) {
    removeSubmissionDir(req.submissionId);
    res.status(500).json({ error: "Could not save submission. Please try again or contact the portal administrator." });
  }
});

function removeSubmissionDir(id) {
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) return;
  fs.rmSync(path.join(DATA_DIR, id), { recursive: true, force: true });
}

app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? `A file exceeds the ${MAX_UPLOAD_MB} MB upload limit.` : "Upload limit exceeded. Please reduce the number or size of files.";
    return res.status(400).json({ error: msg });
  }
  if (err) return res.status(400).json({ error: err.message || "Request could not be processed." });
  next();
});

app.listen(PORT, () => console.log(`Online Document Verification Portal listening on port ${PORT}`));
