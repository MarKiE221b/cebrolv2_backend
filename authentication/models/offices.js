import mongoose from "mongoose";

/**
 * Offices / Divisions within the Commission on Elections (COMELEC) or OCDRA.
 * Users are assigned to an office; some documents/agendas can be scoped per office.
 */
const officeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    /** Short identifier, e.g. "OCDRA", "LSD", "ITD" */
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: 20,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    /** Optional reference to the office head (User). */
    head: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

officeSchema.index({ code: 1 });
officeSchema.index({ isActive: 1 });

const Office =
  mongoose.models.Office || mongoose.model("Office", officeSchema);

export default Office;
