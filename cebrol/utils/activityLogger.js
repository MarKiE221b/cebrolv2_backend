import ActivityLog from "../models/activityLog.js";

/**
 * ACTION → CATEGORY mapping (keeps controllers clean).
 */
const ACTION_CATEGORY = {
  login:           "Login",
  logout:          "Login",
  doc_upload:      "Upload",
  doc_download:    "Download",
  doc_update:      "Document",
  doc_delete:      "Document",
  agenda_upload:   "Upload",
  agenda_download: "Download",
  agenda_delete:   "Agenda",
  meeting_create:  "Meeting",
  meeting_update:  "Meeting",
  meeting_delete:  "Meeting",
  access_request:  "Access",
  access_review:   "Access",
  access_revoke:   "Access",
  user_create:     "User",
  user_update:     "User",
  user_delete:     "User",
  user_activate:   "User",
  user_deactivate: "User",
  password_reset:  "User",
};

/**
 * Write an activity log entry.
 *
 * @param {object} session  - res.locals.session (may be null for system events)
 * @param {object} req      - Express request (used to extract IP)
 * @param {string} action   - One of the action enum values
 * @param {string} target   - Human-readable target description
 * @param {object} [meta]   - Optional extra data stored as JSON
 */
export async function logActivity(session, req, action, target = "", meta = null) {
  try {
    const user = session?.user ?? null;
    const ip   = (
      req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ??
      req?.socket?.remoteAddress ??
      ""
    );

    await ActivityLog.create({
      actor:     user?.id    ?? null,
      actorName: user?.name  ?? "System",
      actorRole: user?.role  ?? "system",
      category:  ACTION_CATEGORY[action] ?? "System",
      action,
      target,
      meta,
      ip,
    });
  } catch {
    // Never let logging failures break the main request
  }
}
