import NewsPost from "../models/newsPost.js";

export const allNewsPosts = async (req, res, next) => {
  try {
    const wantsAll = String(req.query.all ?? "") === "1";
    if (wantsAll) {
      const session = res.locals.session;
      if (!session?.user)
        return res.status(401).json({ error: "Unauthorized" });
      if (session.user.role !== "admin")
        return res.status(403).json({ error: "Forbidden" });
    }

    const filter = wantsAll ? {} : { isPublished: true };
    const items = await NewsPost.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
};

export const getNewsPostById = async (req, res, next) => {
  try {
    const item = await NewsPost.findById(req.params.id).lean();
    if (!item || item.isPublished === false)
      return res.status(404).json({ error: "Not found" });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

export const createNewsPost = async (req, res, next) => {
  try {
    const { title, tag, excerpt, publishedAt, images, content, isPublished } =
      req.body ?? {};
    if (!title || !publishedAt)
      return res
        .status(400)
        .json({ error: "Title and publishedAt are required" });

    const created = await NewsPost.create({
      title,
      tag,
      excerpt,
      publishedAt,
      images: images ?? [],
      content: content ?? [],
      isPublished: isPublished ?? true,
    });

    res.status(201).json({ item: created });
  } catch (err) {
    next(err);
  }
};

export const updateNewsPost = async (req, res, next) => {
  try {
    const updates = req.body ?? {};
    const updated = await NewsPost.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ item: updated });
  } catch (err) {
    next(err);
  }
};

export const deleteNewsPost = async (req, res, next) => {
  try {
    const deleted = await NewsPost.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
