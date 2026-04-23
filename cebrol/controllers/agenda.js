import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PDFParse } from "pdf-parse";
import getS3Client from "../../website/utils/storageConfig.js";
import { uploadMulterFileToSpaces } from "../../website/utils/spacesStorage.js";
import Agenda from "../models/agenda.js";
import Meeting from "../models/meeting.js";
import { logActivity } from "../utils/activityLogger.js";
import { ROLES } from "../../authentication/utils/roles.js";

// ── List agendas (optionally filter by meeting) ───────────────────────────
export const listAgendas = async (req, res, next) => {
  try {
    const { meetingId, type, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (meetingId) filter.meeting = meetingId;
    if (type && ["AGENDA", "MINUTES"].includes(type)) filter.type = type;

    // ── Office-based access restriction ──────────────────────────────────
    // assigned_user and viewer may only see agendas for meetings they are
    // invited to (i.e. their office is in invitedOffices, or the list is empty).
    const userRole   = res.locals.session?.user?.role;
    const userOffice = res.locals.session?.user?.office;
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 50);

    if (userRole === ROLES.ASSIGNED_USER || userRole === ROLES.VIEWER) {
      if (!userOffice) {
        return res.json({ ok: true, data: [], meta: { total: 0, page: pageNum, limit: limitNum, pages: 1 } });
      }

      // Meetings the user's office is invited to (or open-to-all meetings).
      const accessibleMeetings = await Meeting.find({
        $or: [
          { invitedOffices: { $size: 0 } },
          { invitedOffices: userOffice },
        ],
      }).select("_id").lean();

      const allowedIds = accessibleMeetings.map((m) => m._id);

      if (meetingId) {
        // If a specific meeting was requested, verify it's accessible.
        const isAllowed = allowedIds.some((id) => String(id) === String(meetingId));
        if (!isAllowed) {
          return res.json({ ok: true, data: [], meta: { total: 0, page: pageNum, limit: limitNum, pages: 1 } });
        }
        // filter.meeting is already set to the requested meetingId — keep it.
      } else {
        filter.meeting = { $in: allowedIds };
      }
    }

    const [agendas, total] = await Promise.all([
      Agenda.find(filter)
        .populate("meeting", "title meetingCode scheduledDate meetingRef")
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

    const { meetingId, title, description, version, type } = req.body ?? {};
    if (!meetingId)
      return res.status(400).json({ error: "meetingId is required" });
    if (!title) return res.status(400).json({ error: "title is required" });

    const docType = ["AGENDA", "MINUTES"].includes(type) ? type : "AGENDA";

    const meeting = await Meeting.findById(meetingId);
    if (!meeting)
      return res
        .status(404)
        .json({ error: "Meeting not found — cannot upload file" });

    const uploaded = await uploadMulterFileToSpaces(req.file, {
      acl: "private",
      folder: docType === "MINUTES" ? "ceb-minutes" : "ceb-agenda",
    });

    const agenda = await Agenda.create({
      meeting: meetingId,
      title: title.trim(),
      description: description ?? "",
      version: version ?? "v1",
      type: docType,
      fileKey: uploaded.key,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      isEncrypted: false,
      uploadedBy: res.locals.session?.user?.id ?? null,
    });

    await agenda.populate(
      "meeting",
      "title meetingCode scheduledDate meetingRef",
    );
    logActivity(
      res.locals.session,
      req,
      "agenda_upload",
      `${agenda.title} (${agenda.version})`,
      { agendaId: agenda._id },
    );
    return res.status(201).json({ ok: true, data: agenda });
  } catch (err) {
    next(err);
  }
};

// ── Stream / download agenda file ─────────────────────────────────────────
export const downloadAgenda = async (req, res, next) => {
  try {
    const agenda = await Agenda.findById(req.params.id).populate("meeting", "invitedOffices");
    if (!agenda) return res.status(404).json({ error: "Agenda not found" });

    // ── Office-based access restriction ──────────────────────────────────
    const userRole   = res.locals.session?.user?.role;
    const userOffice = res.locals.session?.user?.office;

    if (userRole === ROLES.ASSIGNED_USER || userRole === ROLES.VIEWER) {
      const invitedOffices = agenda.meeting?.invitedOffices ?? [];
      if (
        invitedOffices.length > 0 &&
        !invitedOffices.some((id) => String(id) === String(userOffice))
      ) {
        return res.status(403).json({ error: "Your office is not invited to this meeting." });
      }
    }

    const s3 = getS3Client();
    const cmd = new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: agenda.fileKey,
    });
    const data = await s3.send(cmd);

    res.setHeader("Content-Type", agenda.mimeType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(agenda.originalName || "agenda.pdf")}"`,
    );
    if (data.ContentLength)
      res.setHeader("Content-Length", String(data.ContentLength));

    logActivity(
      res.locals.session,
      req,
      "agenda_download",
      `${agenda.title} (${agenda.originalName})`,
      { agendaId: agenda._id },
    );
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
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.DO_SPACES_BUCKET,
          Key: agenda.fileKey,
        }),
      );
    } catch {
      /* continue even if Spaces delete fails */
    }

    const label = agenda.title;
    await agenda.deleteOne();
    logActivity(res.locals.session, req, "agenda_delete", label, {
      agendaId: agenda._id,
    });
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
    if (title !== undefined) agenda.title = title.trim();
    if (description !== undefined) agenda.description = description;
    if (version !== undefined) agenda.version = version;

    await agenda.save();
    await agenda.populate(
      "meeting",
      "title meetingCode scheduledDate meetingRef",
    );
    logActivity(
      res.locals.session,
      req,
      "agenda_upload",
      `Updated: ${agenda.title} (${agenda.version})`,
      { agendaId: agenda._id },
    );
    return res.json({ ok: true, data: agenda });
  } catch (err) {
    next(err);
  }
};

// ── Extract attendees from a Minutes-of-Meeting PDF ───────────────────────
/**
 * Heuristic parser: finds the PRESENT / IN ATTENDANCE / ATTENDEES section
 * inside the PDF text and returns a flat list of cleaned names.
 */
function parseAttendees(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Section headers that introduce the attendees block
  const sectionRx =
    /^\s*(PRESENT|IN ATTENDANCE|MEMBERS\s+PRESENT|ATTENDEES?|ATTENDANCE|ROLL\s+CALL|PERSONS\s+PRESENT)\s*:?\s*$/i;

  // Headers that mark the beginning of THE NEXT section (stop collecting)
  const nextSectionRx =
    /^\s*(CALL\s+TO\s+ORDER|OPENING|INVOCATION|AGENDA|DISCUSSION|RESOLUTION|ADJOURNMENT|ACTION|OLD\s+BUSINESS|NEW\s+BUSINESS|APPROVAL)\s*:?\s*$/i;

  let inSection = false;
  let emptyStreak = 0;
  const names = [];

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (!inSection) {
      if (sectionRx.test(trimmed)) inSection = true;
      continue;
    }

    if (trimmed === "") {
      if (++emptyStreak >= 2) break; // two consecutive blank lines = section ended
      continue;
    }
    emptyStreak = 0;

    // Stop when a new section heading is detected
    if (nextSectionRx.test(trimmed)) break;
    // Also stop on an ALL-CAPS line ≥ 5 chars that ends with a colon (new heading)
    if (/^[A-Z\s]{5,}:$/.test(trimmed)) break;

    // Clean the line: strip list counters, bullets, and trailing position/title
    let name = trimmed
      .replace(/^\d+[.)\]]\s*/, "") // "1. " / "1) " / "1] "
      .replace(/^[•·\-–—*]\s*/, "") // bullet or dash
      .replace(/^(HON\.?|MR\.?|MS\.?|MRS\.?|DR\.?|ATTY\.?)\s+/i, "") // honorifics
      .split(/\s*[–—]\s*/)[0] // drop " — Position" suffix
      .split(/\s{3,}/)[0] // sometimes name and role are tab-separated
      .trim();

    if (name.length > 2) names.push(name);
  }

  return [...new Set(names)]; // deduplicate
}

export const extractAttendees = async (req, res, next) => {
  try {
    const agenda = await Agenda.findById(req.params.id).lean();
    if (!agenda) return res.status(404).json({ error: "File not found" });

    if (agenda.type !== "MINUTES") {
      return res
        .status(400)
        .json({
          error:
            "Attendee extraction is only available for Minutes of Meeting files",
        });
    }

    const isPdf =
      (agenda.mimeType ?? "").toLowerCase().includes("pdf") ||
      (agenda.originalName ?? "").toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return res
        .status(422)
        .json({ error: "Attendee extraction only supports PDF files" });
    }

    // Fetch from Spaces
    const s3 = getS3Client();
    const cmd = new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: agenda.fileKey,
    });
    const obj = await s3.send(cmd);

    const chunks = [];
    for await (const chunk of obj.Body) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    // pdf-parse v2 API: pass buffer via the `data` LoadParameter (Uint8Array compatible)
    const parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();
    const attendees = parseAttendees(text);

    logActivity(
      res.locals.session,
      req,
      "agenda_extract_attendees",
      agenda.title,
      { agendaId: agenda._id, count: attendees.length },
    );
    return res.json({ ok: true, data: attendees, total: attendees.length });
  } catch (err) {
    next(err);
  }
};
