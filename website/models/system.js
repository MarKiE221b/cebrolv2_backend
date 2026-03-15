import mongoose from "mongoose";

const systemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    url: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: "", trim: true },
    category: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["Available", "Restricted", "Maintenance"],
      default: "Available",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const System = mongoose.models.System || mongoose.model("System", systemSchema);
export default System;
