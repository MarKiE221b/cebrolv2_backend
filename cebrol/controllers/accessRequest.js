import AccessRequest from "../models/accessRequest.js";
import { ACCESS_STATUS } from "../utils/constants.js";
import { ROLES } from "../../authentication/middlewares/authSession.js";
import { logActivity } from "../utils/activityLogger.js";

// ── Submit access request ─────────────────────────────────────────────────
export const requestAccess = async (req, res, next) => {
  try {
    const { documentId, purpose, requestingOffice } = req.body ?? {};
    if (!documentId || !purpose) {
      return res.status(400).json({ error: "documentId and purpose are required" });
    }

    const userId = res.locals.session?.user?.id;

    // Check for existing active request
    const existing = await AccessRequest.findOne({
      document:    documentId,
      requestedBy: userId,
      status:      { $in: [ACCESS_STATUS.PENDING, ACCESS_STATUS.APPROVED] },
    });
    if (existing) {
      return res.status(409).json({
        error: `You already have a ${existing.status.toLowerCase()} request for this document.`,
        data:  existing,
      });
    }

    const request = await AccessRequest.create({
      document:         documentId,
      requestedBy:      userId,
      requestingOffice: requestingOffice ?? null,
      purpose:          purpose.trim(),
      status:           ACCESS_STATUS.PENDING,
    });

    logActivity(res.locals.session, req, "access_request", `Requested access to document ${documentId}`, { requestId: request._id, documentId });
    return res.status(201).json({ ok: true, data: request });
  } catch (err) {
    next(err);
  }
};

// ── List access requests ──────────────────────────────────────────────────
export const listRequests = async (req, res, next) => {
  try {
    const userRole = res.locals.session?.user?.role;
    const userId   = res.locals.session?.user?.id;
    const privileged = [ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY].includes(userRole);

    const { documentId, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (!privileged) filter.requestedBy = userId;       // non-secretary sees only own
    if (documentId) filter.document = documentId;
    if (status && Object.values(ACCESS_STATUS).includes(status)) filter.status = status;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);

    const [requests, total] = await Promise.all([
      AccessRequest.find(filter)
        .populate("requestedBy",      "name email")
        .populate("requestingOffice", "name code")
        .populate("reviewedBy",       "name email")
        .populate({
          path:   "document",
          select: "title cebCode cebDate meetingCode resolutionNumber",
        })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      AccessRequest.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: requests,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
};

// ── Review (approve / deny) ───────────────────────────────────────────────
export const reviewRequest = async (req, res, next) => {
  try {
    const { status, reviewNote, expiresAt } = req.body ?? {};
    if (!status || ![ACCESS_STATUS.APPROVED, ACCESS_STATUS.DENIED].includes(status)) {
      return res.status(400).json({ error: `status must be '${ACCESS_STATUS.APPROVED}' or '${ACCESS_STATUS.DENIED}'` });
    }

    const request = await AccessRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Access request not found" });
    if (request.status !== ACCESS_STATUS.PENDING) {
      return res.status(409).json({ error: `Request is already ${request.status.toLowerCase()}` });
    }

    request.status     = status;
    request.reviewedBy = res.locals.session?.user?.id ?? null;
    request.reviewedAt = new Date();
    if (reviewNote)  request.reviewNote = reviewNote;
    if (expiresAt)   request.expiresAt  = new Date(expiresAt);

    await request.save();
    await request.populate([
      { path: "requestedBy",      select: "name email" },
      { path: "requestingOffice", select: "name code"  },
      { path: "reviewedBy",       select: "name email" },
      { path: "document",         select: "title cebCode" },
    ]);

    logActivity(res.locals.session, req, "access_review", `${status} access for ${request.document?.title ?? request.document}`, { requestId: request._id, status });
    return res.json({ ok: true, data: request });
  } catch (err) {
    next(err);
  }
};

// ── Revoke an approved request ────────────────────────────────────────────
export const revokeAccess = async (req, res, next) => {
  try {
    const request = await AccessRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Access request not found" });
    if (request.status !== ACCESS_STATUS.APPROVED) {
      return res.status(409).json({ error: "Only approved requests can be revoked" });
    }

    request.status     = ACCESS_STATUS.REVOKED;
    request.reviewedBy = res.locals.session?.user?.id ?? null;
    request.reviewedAt = new Date();
    if (req.body?.reviewNote) request.reviewNote = req.body.reviewNote;

    await request.save();
    logActivity(res.locals.session, req, "access_revoke", `Revoked access request ${req.params.id}`, { requestId: request._id });
    return res.json({ ok: true, data: request });
  } catch (err) {
    next(err);
  }
};
