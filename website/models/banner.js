import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: "", trim: true },
    subtitle: { type: String, default: "", trim: true },

    imageSrc: { type: String, required: true, trim: true },
    imageAlt: { type: String, default: "", trim: true },

    href: { type: String, default: "", trim: true },
    ctaText: { type: String, default: "", trim: true },

    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Banner = mongoose.models.Banner || mongoose.model("Banner", bannerSchema);
export default Banner;
