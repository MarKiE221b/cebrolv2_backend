import mongoose from "mongoose";

/**
 * Meeting Agenda — a document attached to a scheduled meeting.
 * A meeting MUST exist before an agenda can be uploaded.
 */
const agendaSchema = new mongoose.Schema(
  {
    /** The meeting this agenda belongs to. Required. */
    meeting: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Meeting",
      required: true,
    },
    title: {
      type:     String,
      required: true,
      trim:     true,
    },
    description: {
      type:    String,
      trim:    true,
      default: "",
    },
    /** Version / revision label, e.g. "v1", "Final" */
    version: {
      type:    String,
      trim:    true,
      default: "v1",
    },
    // ── File storage ──────────────────────────────────────────────────────
    /** DO Spaces / S3 object key */
    fileKey: {
      type:     String,
      required: true,
    },
    /** Original filename for display / download */
    originalName: {
      type:    String,
      default: "",
    },
    /** MIME type */
    mimeType: {
      type:    String,
      default: "application/pdf",
    },
    /** File size in bytes */
    fileSize: {
      type:    Number,
      default: 0,
    },
    /** Whether the agenda file is encrypted */
    isEncrypted: {
      type:    Boolean,
      default: false,
    },
    /** IV (hex) used for encryption — only present if isEncrypted=true */
    encryptionIv: {
      type:    String,
      default: null,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
    },
  },
  { timestamps: true },
);

agendaSchema.index({ meeting: 1 });

const Agenda =
  mongoose.models.Agenda || mongoose.model("Agenda", agendaSchema);

export default Agenda;
