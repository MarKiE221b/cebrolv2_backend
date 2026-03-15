import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import getS3Client from "../../website/utils/storageConfig.js";
import { uploadMulterFileToSpaces } from "../../website/utils/spacesStorage.js";
import Agenda  from "../models/agenda.js";
import Meeting from "../models/meeting.js";
import { logActivity } from "../utils/activityLogger.js";

// ── List agendas (optionally filter by meeting) ───────────────────────────
export const listAgendas = async (req, res, next) => {
  try {
    const { meetingId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (meetingId) filter.meeting = meetingId;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 50);

    const [agendas, total] = await Promise.all([
      Agenda.find(filter)
        .populate("meeting",    "title meetingCode scheduledDate meetingRef")
        .populate("uploadedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Agenda.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: agendas,
      meta: { total, page: pageNum, limit: limitNum },
    });
  } catch (err) {
    next(err);
  }
};

// ── Upload agenda (meeting must exist) ────────────────────────────────────
export const uploadAgenda = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { meetingId, title, description, version } = req.body ?? {};
    if (!meetingId) return res.status(400).json({ error: "meetingId is required" });
    if (!title)     return res.status(400).json({ error: "title is required" });

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) return res.status(404).json({ error: "Meeting not found — cannot upload agenda" });

    const uploaded = await uploadMulterFileToSpaces(req.file, {
      acl:    "private",
      folder: "ceb-agenda",
    });

    const agenda = await Agenda.create({
      meeting:      meetingId,
      title:        title.trim(),
      description:  description ?? "",
      version:      version ?? "v1",
      fileKey:      uploaded.key,
      originalName: req.file.originalname,
      mimeType:     req.file.mimetype,
      fileSize:     req.file.size,
      isEncrypted:  false,
      uploadedBy:   res.locals.session?.user?.id ?? null,
    });

    await agenda.populate("meeting", "title meetingCode scheduledDate meetingRef");
    logActivity(res.locals.session, req, "agenda_upload", `${agenda.title} (${agenda.version})`, { agendaId: agenda._id });
    return res.status(201).json({ ok: true, data: agenda });
  } catch (err) {
    next(err);
  }
};

// ── Stream / download agenda file ─────────────────────────────────────────
export const downloadAgenda = async (req, res, next) => {
  try {
    const agenda = await Agenda.findById(req.params.id);
    if (!agenda) return res.status(404).json({ error: "Agenda not found" });

    const s3 = getS3Client();
    const cmd = new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key:    agenda.fileKey,
    });
    const data = await s3.send(cmd);

    res.setHeader("Content-Type",        agenda.mimeType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(agenda.originalName || "agenda.pdf")}"`);
    if (data.ContentLength) res.setHeader("Content-Length", String(data.ContentLength));

    logActivity(res.locals.session, req, "agenda_download", `${agenda.title} (${agenda.originalName})`, { agendaId: agenda._id });
    data.Body.pipe(res);
  } catch (err) {
    next(err);
  }
};

// ── Delete agenda ─────────────────────────────────────────────────────────
export const deleteAgenda = async (req, res, next) => {
  try {
    const agenda = await Agenda.findById(req.params.id);
    if (!agenda) return res.status(404).json({ error: "Agenda not found" });

    // Remove from Spaces
    try {
      const s3 = getS3Client();
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.DO_SPACES_BUCKET, Key: agenda.fileKey }));
    } catch { /* continue even if Spaces delete fails */ }

    const label = agenda.title;
    await agenda.deleteOne();
    logActivity(res.locals.session, req, "agenda_delete", label, { agendaId: agenda._id });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── Update agenda metadata (title, description, version) ────────────────
export const updateAgenda = async (req, res, next) => {
  try {
    const agenda = await Agenda.findById(req.params.id);
    if (!agenda) return res.status(404).json({ error: "Agenda not found" });

    const { title, description, version } = req.body ?? {};
    if (title       !== undefined) agenda.title       = title.trim();
    if (description !== undefined) agenda.description = description;
    if (version     !== undefined) agenda.version     = version;

    await agenda.save();
    await agenda.populate("meeting", "title meetingCode scheduledDate meetingRef");
    logActivity(res.locals.session, req, "agenda_upload", `Updated: ${agenda.title} (${agenda.version})`, { agendaId: agenda._id });
    return res.json({ ok: true, data: agenda });
  } catch (err) {
    next(err);
  }
};
