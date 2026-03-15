import mongoose from "mongoose";
import { ACCESS_STATUS } from "../utils/constants.js";

/**
 * AccessRequest — an office user requests access to an encrypted CEB document.
 * The communications secretary approves or denies it.
 */
const accessRequestSchema = new mongoose.Schema(
  {
    document: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "CebDocument",
      required: true,
    },
    /** User who is requesting access */
    requestedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },
    /** Their office at time of request */
    requestingOffice: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Office",
      default: null,
    },
    /** Reason / purpose for requesting access */
    purpose: {
      type:     String,
      required: true,
      trim:     true,
    },
    status: {
      type:    String,
      enum:    Object.values(ACCESS_STATUS),
      default: ACCESS_STATUS.PENDING,
    },
    /** Secretary who reviewed the request */
    reviewedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },
    reviewedAt: {
      type:    Date,
      default: null,
    },
    /** Optional reason for denial */
    reviewNote: {
      type:    String,
      trim:    true,
      default: "",
    },
    /** Once approved, the access expires at this date (optional) */
    expiresAt: {
      type:    Date,
      default: null,
    },
    /** Track download events */
    downloadCount: {
      type:    Number,
      default: 0,
    },
    lastDownloadedAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true },
);

accessRequestSchema.index({ document: 1 });
accessRequestSchema.index({ requestedBy: 1 });
accessRequestSchema.index({ status: 1 });
// A user can only have one active/pending request per document
accessRequestSchema.index(
  { document: 1, requestedBy: 1, status: 1 },
  { unique: false },
);

const AccessRequest =
  mongoose.models.AccessRequest ||
  mongoose.model("AccessRequest", accessRequestSchema);

export default AccessRequest;
