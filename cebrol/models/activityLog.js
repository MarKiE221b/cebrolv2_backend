import mongoose from "mongoose";

/**
 * Audit log for all significant user actions across the system.
 * Kept lean (no ref population at query time — actor details are
 * denormalised so logs survive user deletion).
 */
const activityLogSchema = new mongoose.Schema(
  {
    // Who performed the action
    actor:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, default: "System" },
    actorRole: { type: String, default: "system" },

    // High-level category used for filtering in the UI
    category: {
      type: String,
      enum: ["Login", "Upload", "Download", "Document", "Meeting", "Agenda", "Access", "User", "System"],
      default: "System",
    },

    // Granular action slug
    action: {
      type: String,
      enum: [
        "login", "logout",
        "doc_upload", "doc_download", "doc_update", "doc_delete",
        "agenda_upload", "agenda_download", "agenda_delete",
        "meeting_create", "meeting_update", "meeting_delete",
        "access_request", "access_review", "access_revoke",
        "user_create", "user_update", "user_delete",
        "user_activate", "user_deactivate", "password_reset",
      ],
      required: true,
    },

    // Human-readable description of the target object
    target: { type: String, default: "" },

    // Optional extra context (document id, meeting ref, etc.)
    meta: { type: mongoose.Schema.Types.Mixed, default: null },

    // Request IP captured at controller level
    ip: { type: String, default: "" },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// Index for paginated queries by category, actor, and time
activityLogSchema.index({ category: 1, createdAt: -1 });
activityLogSchema.index({ actor: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export default ActivityLog;
