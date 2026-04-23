import Meeting from "../models/meeting.js";
import Agenda  from "../models/agenda.js";
import { MEETING_CODES, MEETING_STATUS } from "../utils/constants.js";
import { logActivity } from "../utils/activityLogger.js";
import { ROLES } from "../../authentication/utils/roles.js";

// ── List meetings ──────────────────────────────────────────────────────────
export const listMeetings = async (req, res, next) => {
  try {
    const {
      meetingCode, status, from, to,
      page = 1, limit = 20,
    } = req.query;

    const filter = {};
    if (meetingCode && MEETING_CODES[meetingCode]) filter.meetingCode = meetingCode;
    if (status && Object.values(MEETING_STATUS).includes(status)) filter.status = status;
    if (from || to) {
      filter.scheduledDate = {};
      if (from) filter.scheduledDate.$gte = new Date(from);
      if (to)   filter.scheduledDate.$lte = new Date(to);
    }

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);

    // Office-based restriction: assigned_user and viewer only see meetings
    // their office is invited to (or meetings open to all).
    const userRole   = res.locals.session?.user?.role;
    const userOffice = res.locals.session?.user?.office;

    if (userRole === ROLES.ASSIGNED_USER || userRole === ROLES.VIEWER) {
      if (!userOffice) {
        return res.json({ ok: true, data: [], meta: { total: 0, page: pageNum, limit: limitNum, pages: 1 } });
      }
      filter.$or = [
        { invitedOffices: { $size: 0 } },
        { invitedOffices: userOffice },
      ];
    }

    const [meetings, total] = await Promise.all([
      Meeting.find(filter)
        .populate("createdBy",      "name email")
        .populate("invitedOffices", "name code")
        .sort({ scheduledDate: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Meeting.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: meetings,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
};

// ── Get single meeting ─────────────────────────────────────────────────────
export const getMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate("createdBy",      "name email")
      .populate("invitedOffices", "name code")
      .lean();

    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    // Also return agenda count for this meeting
    const agendaCount = await Agenda.countDocuments({ meeting: meeting._id });
    return res.json({ ok: true, data: { ...meeting, agendaCount } });
  } catch (err) {
    next(err);
  }
};

// ── Create meeting ─────────────────────────────────────────────────────────
export const createMeeting = async (req, res, next) => {
  try {
    const {
      title, meetingCode, scheduledDate, endDate,
      venue, description, invitedOffices, meetingRef,
    } = req.body ?? {};

    if (!title || !meetingCode || !scheduledDate) {
      return res.status(400).json({ error: "title, meetingCode and scheduledDate are required" });
    }
    if (!Object.values(MEETING_CODES).includes(meetingCode)) {
      return res.status(400).json({ error: "Invalid meeting code" });
    }

    // Auto-generate meetingRef if not supplied
    let ref = meetingRef;
    if (!ref) {
      const year  = new Date(scheduledDate).getFullYear();
      const count = await Meeting.countDocuments({
        meetingCode,
        scheduledDate: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        },
      });
      ref = `${meetingCode}-${year}-${String(count + 1).padStart(3, "0")}`;
    }

    const meeting = await Meeting.create({
      title,
      meetingCode,
      meetingRef:     ref,
      scheduledDate:  new Date(scheduledDate),
      endDate:        endDate ? new Date(endDate) : null,
      venue:          venue       ?? "",
      description:    description ?? "",
      invitedOffices: Array.isArray(invitedOffices) ? invitedOffices : [],
      createdBy:      res.locals.session?.user?.id ?? null,
    });

    logActivity(res.locals.session, req, "meeting_create", `${meeting.meetingRef} — ${meeting.title}`, { meetingId: meeting._id });
    return res.status(201).json({ ok: true, data: meeting });
  } catch (err) {
    next(err);
  }
};

// ── Update meeting ─────────────────────────────────────────────────────────
export const updateMeeting = async (req, res, next) => {
  try {
    const { title, scheduledDate, endDate, venue, description, status, invitedOffices, meetingRef } = req.body ?? {};

    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    if (title)           meeting.title           = title;
    if (scheduledDate)   meeting.scheduledDate   = new Date(scheduledDate);
    if (endDate)         meeting.endDate         = new Date(endDate);
    if (venue !== undefined)       meeting.venue       = venue;
    if (description !== undefined) meeting.description = description;
    if (meetingRef)      meeting.meetingRef      = meetingRef;
    if (status && Object.values(MEETING_STATUS).includes(status)) meeting.status = status;
    if (Array.isArray(invitedOffices)) meeting.invitedOffices = invitedOffices;

    await meeting.save();
    logActivity(res.locals.session, req, "meeting_update", `${meeting.meetingRef} — ${meeting.title}`, { meetingId: meeting._id });
    return res.json({ ok: true, data: meeting });
  } catch (err) {
    next(err);
  }
};

// ── Delete meeting ─────────────────────────────────────────────────────────
export const deleteMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    const agendaCount = await Agenda.countDocuments({ meeting: meeting._id });
    if (agendaCount > 0) {
      return res.status(409).json({
        error: `Cannot delete meeting — ${agendaCount} agenda item(s) are attached. Remove them first.`,
      });
    }

    const label = `${meeting.meetingRef} — ${meeting.title}`;
    await meeting.deleteOne();
    logActivity(res.locals.session, req, "meeting_delete", label, { meetingId: meeting._id });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
