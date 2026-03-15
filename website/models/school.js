import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, default: "SUC", trim: true },
    description: { type: String, default: "", trim: true },
    websiteUrl: { type: String, default: "", trim: true },
    logoUrl: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const School = mongoose.models.School || mongoose.model("School", schoolSchema);
export default School;
