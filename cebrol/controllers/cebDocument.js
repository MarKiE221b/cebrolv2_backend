import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import getS3Client        from "../../website/utils/storageConfig.js";
import { uploadMulterFileToSpaces } from "../../website/utils/spacesStorage.js";
import { encryptBuffer, decryptBuffer } from "../utils/encryption.js";
import CebDocument from "../models/cebDocument.js";
import AccessRequest from "../models/accessRequest.js";
import { ACCESS_STATUS, DOC_STATUS, MEETING_CODES } from "../utils/constants.js";
import { ROLES } from "../../authentication/middlewares/authSession.js";
import { logActivity } from "../utils/activityLogger.js";

// ── List documents ─────────────────────────────────────────────────────────
export const listDocuments = async (req, res, next) => {
  try {
    const {
      meetingCode, office, status, from, to,
      search, page = 1, limit = 20,
    } = req.query;

    const filter = {};
    if (meetingCode && MEETING_CODES[meetingCode]) filter.meetingCode = meetingCode;
    if (office)  filter.office  = office;
    if (status && Object.values(DOC_STATUS).includes(status))  filter.status = status;
    if (from || to) {
      filter.cebDate = {};
      if (from) filter.cebDate.$gte = new Date(from);
      if (to)   filter.cebDate.$lte = new Date(to);
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { title: rx }, { subject: rx }, { cebCode: rx },
        { resolutionNumber: rx }, { briefer: rx },
      ];
    }

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);

    const [docs, total] = await Promise.all([
      CebDocument.find(filter)
        .populate("office",       "name code")
        .populate("meeting",      "title meetingCode scheduledDate meetingRef")
        .populate("uploadedBy",   "name email")
        .sort({ cebDate: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      CebDocument.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: docs,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
};

// ── Get single document metadata (no file) ────────────────────────────────
export const getDocument = async (req, res, next) => {
  try {
    const doc = await CebDocument.findById(req.params.id)
      .populate("office",         "name code")
      .populate("meeting",        "title meetingCode scheduledDate meetingRef")
      .populate("uploadedBy",     "name email")
      .populate("lastModifiedBy", "name email")
      .lean();

    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Strip encryption fields from the response
    const { encryptionIv, fileKey, ...safe } = doc;
    return res.json({ ok: true, data: safe });
  } catch (err) {
    next(err);
  }
};

// ── Upload document (always encrypted) ────────────────────────────────────
export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const {
      cebDate, cebCode, meetingCode, resolutionNumber,
      meeting, office, briefer, title, subject,
      remarks, tags, status,
    } = req.body ?? {};

    if (!cebDate || !cebCode || !meetingCode || !title || !office) {
      return res.status(400).json({ error: "cebDate, cebCode, meetingCode, title and office are required" });
    }
    if (!MEETING_CODES[meetingCode]) {
      return res.status(400).json({ error: "Invalid meetingCode" });
    }

    // 1. Encrypt the file buffer
    const { cipher, iv } = encryptBuffer(req.file.buffer);

    // 2. Upload encrypted buffer to Spaces (private ACL)
    //    We overwrite req.file.buffer so that uploadMulterFileToSpaces sends the cipher
    const fakeFile = {
      buffer:       cipher,
      originalname: req.file.originalname + ".enc",
      mimetype:     "application/octet-stream",
      size:         cipher.length,
      fieldname:    req.file.fieldname,
    };
    const uploaded = await uploadMulterFileToSpaces(fakeFile, { acl: "private", folder: "ceb-documents" });

    // 3. Persist metadata + iv
    const doc = await CebDocument.create({
      cebDate:         new Date(cebDate),
      cebCode:         cebCode.trim(),
      meetingCode,
      resolutionNumber: resolutionNumber ?? "",
      meeting:         meeting   || null,
      office,
      briefer:         briefer   ?? "",
      title:           title.trim(),
      subject:         subject   ?? "",
      remarks:         remarks   ?? "",
      tags:            tags ? JSON.parse(tags) : [],
      status:          status ?? DOC_STATUS.DRAFT,
      fileKey:         uploaded.key,
      originalName:    req.file.originalname,
      mimeType:        req.file.mimetype,
      fileSize:        req.file.size,
      encryptionIv:    iv,
      isRestricted:    true,
      uploadedBy:      res.locals.session?.user?.id ?? null,
    });

    await doc.populate("office",  "name code");
    await doc.populate("meeting", "title meetingCode scheduledDate");

    logActivity(res.locals.session, req, "doc_upload", `${doc.cebCode} — ${doc.title}`, { docId: doc._id });
    return res.status(201).json({ ok: true, data: doc });
  } catch (err) {
    next(err);
  }
};

// ── Download document (decrypt & stream) ─────────────────────────────────
export const downloadDocument = async (req, res, next) => {
  try {
    const doc = await CebDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const userId = res.locals.session?.user?.id;

    // Check access — secretary / super_admin always allowed
    const userRole = res.locals.session?.user?.role;
    const privileged = [ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY].includes(userRole);

    if (!privileged) {
      // Must have an approved, non-expired AccessRequest
      const now = new Date();
      const approved = await AccessRequest.findOne({
        document:    doc._id,
        requestedBy: userId,
        status:      ACCESS_STATUS.APPROVED,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gte: now } },
        ],
      });

      if (!approved) {
        return res.status(403).json({ error: "Access denied. No approved access request for this document." });
      }

      // Increment download counter
      approved.downloadCount       = (approved.downloadCount ?? 0) + 1;
      approved.lastDownloadedAt    = now;
      await approved.save();
    }

    // Fetch encrypted blob from Spaces
    const s3  = getS3Client();
    const cmd = new GetObjectCommand({ Bucket: process.env.DO_SPACES_BUCKET, Key: doc.fileKey });
    const obj = await s3.send(cmd);

    const chunks = [];
    for await (const chunk of obj.Body) chunks.push(chunk);
    const encryptedBuffer = Buffer.concat(chunks);

    // Decrypt
    const decrypted = decryptBuffer(encryptedBuffer, doc.encryptionIv);

    res.setHeader("Content-Type",        doc.mimeType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.originalName || "document.pdf")}"`);
    res.setHeader("Content-Length",      String(decrypted.length));
    logActivity(res.locals.session, req, "doc_download", `${doc.cebCode} — ${doc.title}`, { docId: doc._id });
    return res.send(decrypted);
  } catch (err) {
    next(err);
  }
};

// ── Update document metadata ──────────────────────────────────────────────
export const updateDocument = async (req, res, next) => {
  try {
    const doc = await CebDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const fields = [
      "cebDate", "cebCode", "meetingCode", "resolutionNumber",
      "meeting", "office", "briefer", "title", "subject",
      "remarks", "tags", "status", "signatories", "isRestricted",
    ];
    for (const f of fields) {
      if (req.body?.[f] !== undefined) {
        doc[f] = f === "cebDate" ? new Date(req.body[f]) : req.body[f];
      }
    }
    doc.lastModifiedBy = res.locals.session?.user?.id ?? null;
    await doc.save();

    logActivity(res.locals.session, req, "doc_update", `${doc.cebCode} — ${doc.title}`, { docId: doc._id });
    return res.json({ ok: true, data: doc });
  } catch (err) {
    next(err);
  }
};

// ── Delete document ───────────────────────────────────────────────────────
export const deleteDocument = async (req, res, next) => {
  try {
    const doc = await CebDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Remove from Spaces
    try {
      const s3 = getS3Client();
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.DO_SPACES_BUCKET, Key: doc.fileKey }));
    } catch { /* continue even if Spaces delete fails — log in prod */ }

    // Remove associated access requests
    await AccessRequest.deleteMany({ document: doc._id });

    const label = `${doc.cebCode} — ${doc.title}`;
    await doc.deleteOne();
    logActivity(res.locals.session, req, "doc_delete", label, { docId: doc._id });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
