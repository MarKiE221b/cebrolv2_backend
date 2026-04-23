import mongoose from "mongoose";
import { MEETING_CODES, DOC_STATUS, BOARD_ACTION, OFFICE_STATUS } from "../utils/constants.js";

/**
 * CEB Repository Document — Resolutions and Referendum files.
 * Files are stored encrypted in DO Spaces; access is request-gated.
 */
const cebDocumentSchema = new mongoose.Schema(
  {
    // ── Identification ─────────────────────────────────────────────────────
    /** Date of the CEB meeting/resolution */
    cebDate: {
      type:     Date,
      required: true,
    },
    /**
     * CEB Code — derived from the linked meeting's meetingRef (e.g. "CEB-2026-005").
     * Auto-populated by the controller from meeting.meetingRef.
     */
    cebCode: {
      type:    String,
      trim:    true,
      default: "",
    },
    /** Meeting type code: CEB | EXE | MAN | NDM | REF */
    meetingCode: {
      type:     String,
      enum:     Object.values(MEETING_CODES),
      required: true,
    },
    /** Resolution number, e.g. "Resolution No. 10740" */
    resolutionNumber: {
      type:  String,
      trim:  true,
      default: "",
    },
    /** Optional link to the corresponding scheduled meeting */
    meeting: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Meeting",
      default: null,
    },
    /** Responsible office */
    office: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Office",
      default: null,
    },
    /** All offices to which this resolution is directed / assigned */
    assignedOffices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref:  "Office",
      },
    ],
    /** Short summary / briefer displayed in the listing */
    briefer: {
      type:    String,
      trim:    true,
      default: "",
    },
    /** Full title of the resolution/referendum */
    title: {
      type:     String,
      required: true,
      trim:     true,
    },
    subject: {
      type:    String,
      trim:    true,
      default: "",
    },
    /** Additional remarks */
    remarks: {
      type:    String,
      trim:    true,
      default: "",
    },
    /** Signatories / commissioners who signed */
    signatories: [
      {
        type: String,
        trim: true,
      },
    ],

    // ── File storage ─────────────────────────────────────────────────────
    fileKey: {
      type:     String,
      required: true,
    },
    originalName: {
      type:    String,
      default: "",
    },
    mimeType: {
      type:    String,
      default: "application/pdf",
    },
    fileSize: {
      type:    Number,
      default: 0,
    },
    /** All CEB repository files are encrypted at rest */
    encryptionIv: {
      type:     String,
      required: true,
    },

    // ── Classification ────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    Object.values(DOC_STATUS),
      default: DOC_STATUS.PUBLISHED,
    },
    /** Only secretary + approved requestors can download */
    isRestricted: {
      type:    Boolean,
      default: true,
    },
    /** Board action taken on the document */
    boardAction: {
      type:    String,
      enum:    Object.values(BOARD_ACTION),
      default: null,
    },
    /**
     * Per-office compliance statuses.
     * One entry per office in assignedOffices.
     * Only the personnel of each office can update their own entry.
     */
    officeStatuses: [
      {
        office: {
          type:     mongoose.Schema.Types.ObjectId,
          ref:      "Office",
          required: true,
        },
        status: {
          type:    String,
          enum:    Object.values(OFFICE_STATUS),
          default: OFFICE_STATUS.PENDING,
        },
        updatedBy: {
          type:    mongoose.Schema.Types.ObjectId,
          ref:     "User",
          default: null,
        },
        updatedAt: {
          type:    Date,
          default: null,
        },
      },
    ],
    tags: [{ type: String, trim: true }],

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
    },
    lastModifiedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },
  },
  { timestamps: true },
);

cebDocumentSchema.index({ cebDate: -1 });
cebDocumentSchema.index({ meetingCode: 1 });
cebDocumentSchema.index({ cebCode: 1 });
cebDocumentSchema.index({ office: 1 });
cebDocumentSchema.index({ status: 1 });

const CebDocument =
  mongoose.models.CebDocument ||
  mongoose.model("CebDocument", cebDocumentSchema);

export default CebDocument;
