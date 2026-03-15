import mongoose from "mongoose";

const newsImageSchema = new mongoose.Schema(
  {
    src: { type: String, required: true, trim: true },
    alt: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const newsBlockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["p"], default: "p" },
    text: { type: String, required: true },
  },
  { _id: false }
);

const newsPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    tag: { type: String, default: "News", trim: true },
    excerpt: { type: String, default: "", trim: true },
    publishedAt: { type: String, required: true, trim: true },
    images: { type: [newsImageSchema], default: [] },
    content: { type: [newsBlockSchema], default: [] },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const NewsPost =
  mongoose.models.NewsPost || mongoose.model("NewsPost", newsPostSchema);
export default NewsPost;
