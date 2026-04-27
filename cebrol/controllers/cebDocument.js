import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import getS3Client        from "../../website/utils/storageConfig.js";
import { uploadMulterFileToSpaces } from "../../website/utils/spacesStorage.js";
import { encryptBuffer, decryptBuffer } from "../utils/encryption.js";
import CebDocument from "../models/cebDocument.js";
import Meeting from "../models/meeting.js";
import AccessRequest from "../models/accessRequest.js";
import { ACCESS_STATUS, BOARD_ACTION, OFFICE_STATUS, DOC_STATUS, MEETING_CODES } from "../utils/constants.js";
import { ROLES } from "../../authentication/middlewares/authSession.js";
import { logActivity } from "../utils/activityLogger.js";

// ── List documents ─────────────────────────────────────────────────────────
export const listDocuments = async (req, res, next) => {
  try {
    const {
      meetingCode, office, status, from, to,
      search, assignedOffice, page = 1, limit = 20,
    } = req.query;

    const filter = {};
    if (meetingCode && MEETING_CODES[meetingCode]) filter.meetingCode = meetingCode;
    if (office)  filter.office  = office;
    if (assignedOffice) filter.assignedOffices = assignedOffice;
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
        .populate("office",                    "name code")
        .populate("assignedOffices",           "name code")
        .populate("officeStatuses.office",     "name code")
        .populate("officeStatuses.updatedBy",  "name email")
        .populate("meeting",                   "title meetingCode scheduledDate meetingRef")
        .populate("uploadedBy",                "name email")
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
      .populate("office",                    "name code")
      .populate("assignedOffices",           "name code")
      .populate("officeStatuses.office",     "name code")
      .populate("officeStatuses.updatedBy",  "name email")
      .populate("meeting",                   "title meetingCode scheduledDate meetingRef")
      .populate("uploadedBy",                "name email")
      .populate("lastModifiedBy",            "name email")
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
      meeting, briefer, title, subject,
      remarks, status, boardAction, isRestricted,
    } = req.body ?? {};

    if (!meeting) {
      return res.status(400).json({ error: "meeting (Linked Meeting) is required" });
    }
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    // Parse tags — sent as tags[] individual fields from FormData
    const rawTags = req.body["tags[]"];
    const tagsParsed = rawTags
      ? (Array.isArray(rawTags) ? rawTags : [rawTags]).map((t) => t.trim()).filter(Boolean)
      : [];

    // Parse assignedOffices (sent as JSON string in FormData)
    let assignedOfficesParsed = [];
    try {
      if (req.body.assignedOffices) {
        assignedOfficesParsed = JSON.parse(req.body.assignedOffices);
        if (!Array.isArray(assignedOfficesParsed)) assignedOfficesParsed = [];
      }
    } catch { /* ignore malformed JSON */ }

    // Derive cebDate, cebCode and meetingCode from the linked meeting
    const linkedMeeting = await Meeting.findById(meeting).lean();
    if (!linkedMeeting) {
      return res.status(400).json({ error: "Linked meeting not found" });
    }
    const cebDate     = linkedMeeting.scheduledDate;
    const cebCode     = linkedMeeting.meetingRef  ?? "";
    const meetingCode = linkedMeeting.meetingCode ?? "CEB";

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
      cebDate:     new Date(cebDate),
      cebCode,
      meetingCode,
      meeting,
      assignedOffices: assignedOfficesParsed,
      officeStatuses:  assignedOfficesParsed.map((officeId) => ({
        office:    officeId,
        status:    OFFICE_STATUS.PENDING,
        updatedBy: null,
        updatedAt: null,
      })),
      briefer:         briefer   ?? "",
      title:           title.trim(),
      subject:         subject   ?? "",
      remarks:         remarks   ?? "",
      tags:            tagsParsed,
      status:          status ?? DOC_STATUS.DRAFT,
      boardAction:     boardAction && Object.values(BOARD_ACTION).includes(boardAction) ? boardAction : null,
      fileKey:         uploaded.key,
      originalName:    req.file.originalname,
      mimeType:        req.file.mimetype,
      fileSize:        req.file.size,
      encryptionIv:    iv,
      isRestricted:    isRestricted === "false" ? false : true,
      uploadedBy:      res.locals.session?.user?.id ?? null,
    });

    await doc.populate("office",          "name code");
    await doc.populate("assignedOffices", "name code");
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
      // Restricted documents require an approved, non-expired AccessRequest
      if (doc.isRestricted) {
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
        approved.downloadCount    = (approved.downloadCount ?? 0) + 1;
        approved.lastDownloadedAt = now;
        await approved.save();
      }
      // Non-restricted documents are open to all authenticated users — no access request needed
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
      "meeting", "briefer", "title", "subject",
      "remarks", "tags", "status", "isRestricted", "boardAction",
    ];
    for (const f of fields) {
      if (req.body?.[f] !== undefined) {
        doc[f] = f === "cebDate" ? new Date(req.body[f]) : req.body[f];
      }
    }

    // Handle assignedOffices separately (array field) and sync officeStatuses
    if (req.body?.assignedOffices !== undefined) {
      const newOffices = Array.isArray(req.body.assignedOffices) ? req.body.assignedOffices : [];
      doc.assignedOffices = newOffices;

      // Build a map of existing statuses so we don't overwrite progress already recorded
      const existingMap = {};
      for (const os of doc.officeStatuses ?? []) {
        existingMap[String(os.office)] = os;
      }
      // Rebuild officeStatuses — keep existing entries for offices still assigned, add PENDING for new ones
      doc.officeStatuses = newOffices.map((officeId) => {
        const key = String(officeId);
        return existingMap[key] ?? { office: officeId, status: OFFICE_STATUS.PENDING, updatedBy: null, updatedAt: null };
      });
    }

    // If meeting changed, re-derive cebDate, cebCode and meetingCode
    if (req.body?.meeting !== undefined && req.body.meeting) {
      const linkedMeeting = await Meeting.findById(req.body.meeting).lean();
      if (linkedMeeting) {
        doc.cebDate     = linkedMeeting.scheduledDate ?? doc.cebDate;
        doc.cebCode     = linkedMeeting.meetingRef    ?? doc.cebCode;
        doc.meetingCode = linkedMeeting.meetingCode   ?? doc.meetingCode;
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

// ── Patch board action (secretary / admin only) ──────────────────────────────
export const patchBoardAction = async (req, res, next) => {
  try {
    const doc = await CebDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Only privileged roles may set the board action
    const userRole   = res.locals.session?.user?.role;
    const privileged = [ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY].includes(userRole);
    if (!privileged) {
      return res.status(403).json({ error: "Only the secretariat or admin may update the board action." });
    }

    const { boardAction } = req.body;
    const valid = ["APPROVED", "CONDITIONALLY_APPROVED", "DISAPPROVED", "", null];
    if (!valid.includes(boardAction)) {
      return res.status(400).json({ error: "Invalid boardAction value." });
    }

    doc.boardAction    = boardAction || null;
    doc.lastModifiedBy = res.locals.session?.user?.id ?? null;
    await doc.save();

    logActivity(res.locals.session, req, "doc_board_action", `${doc.cebCode} — ${doc.title}`, { docId: doc._id, boardAction });
    return res.json({ ok: true, data: { boardAction: doc.boardAction } });
  } catch (err) {
    next(err);
  }
};

// ── Patch per-office status (assigned office personnel only) ─────────────────
export const patchOfficeStatus = async (req, res, next) => {
  try {
    const doc = await CebDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const userRole   = res.locals.session?.user?.role;
    const userOffice = res.locals.session?.user?.office;
    const userId     = res.locals.session?.user?.id;
    const privileged = [ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY].includes(userRole);

    const { status } = req.body;
    if (!status || !Object.values(OFFICE_STATUS).includes(status)) {
      return res.status(400).json({ error: "Invalid status value." });
    }

    // Determine which office's status to update
    // Privileged users may pass an explicit officeId; assigned users only update their own
    let targetOfficeId;
    if (privileged) {
      targetOfficeId = req.body.officeId ?? userOffice;
      if (!targetOfficeId) {
        return res.status(400).json({ error: "officeId is required." });
      }
    } else {
      if (!userOffice) {
        return res.status(403).json({ error: "Your account has no office assigned." });
      }
      targetOfficeId = userOffice;
    }

    // Find the matching officeStatus entry
    const entry = (doc.officeStatuses ?? []).find(
      (os) => String(os.office) === String(targetOfficeId)
    );

    if (!entry) {
      return res.status(403).json({ error: "Your office is not assigned to this document." });
    }

    entry.status    = status;
    entry.updatedBy = userId;
    entry.updatedAt = new Date();
    doc.lastModifiedBy = userId;
    await doc.save();

    logActivity(res.locals.session, req, "doc_office_status", `${doc.cebCode} — ${doc.title}`, { docId: doc._id, officeId: targetOfficeId, status });
    return res.json({ ok: true, data: { officeId: targetOfficeId, status } });
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
