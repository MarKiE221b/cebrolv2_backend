import mongoose from "mongoose";
import { MEETING_CODES, MEETING_STATUS } from "../utils/constants.js";

/**
 * Represents a scheduled CEB meeting / session.
 */
const meetingSchema = new mongoose.Schema(
  {
    /** Human-readable title, e.g. "CEB Meeting No. 5 S. 2026" */
    title: {
      type:     String,
      required: true,
      trim:     true,
    },
    /** Meeting type code: CEB | EXE | MAN | NDM | REF */
    meetingCode: {
      type:     String,
      enum:     Object.values(MEETING_CODES),
      required: true,
    },
    /** Unique auto-generated or manually assigned code e.g. "CEB-2026-005" */
    meetingRef: {
      type:   String,
      trim:   true,
      unique: true,
      sparse: true,
    },
    scheduledDate: {
      type:     Date,
      required: true,
    },
    /** Optional end time for the meeting. */
    endDate: {
      type:    Date,
      default: null,
    },
    venue: {
      type:    String,
      trim:    true,
      default: "",
    },
    description: {
      type:    String,
      trim:    true,
      default: "",
    },
    status: {
      type:    String,
      enum:    Object.values(MEETING_STATUS),
      default: MEETING_STATUS.SCHEDULED,
    },
    /** Secretary who created the meeting */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
    },
    /** Optional list of invited offices */
    invitedOffices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref:  "Office",
      },
    ],
  },
  { timestamps: true },
);

meetingSchema.index({ scheduledDate: -1 });
meetingSchema.index({ meetingCode: 1 });
meetingSchema.index({ status: 1 });

const Meeting =
  mongoose.models.Meeting || mongoose.model("Meeting", meetingSchema);

export default Meeting;
