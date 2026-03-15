import Banner from "../models/banner.js";

export const allBanners = async (req, res, next) => {
  try {
    const wantsAll = String(req.query.all ?? "") === "1";
    if (wantsAll) {
      const session = res.locals.session;
      if (!session?.user)
        return res.status(401).json({ error: "Unauthorized" });
      if (session.user.role !== "admin")
        return res.status(403).json({ error: "Forbidden" });
    }

    const filter = wantsAll ? {} : { isActive: true };
    const items = await Banner.find(filter)
      .sort({ order: 1, updatedAt: -1, createdAt: -1 })
      .lean();

    res.json({ items });
  } catch (err) {
    next(err);
  }
};

export const getBannerById = async (req, res, next) => {
  try {
    const item = await Banner.findById(req.params.id).lean();
    if (!item || item.isActive === false)
      return res.status(404).json({ error: "Not found" });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

export const createBanner = async (req, res, next) => {
  try {
    const {
      title,
      subtitle,
      imageSrc,
      imageAlt,
      href,
      ctaText,
      order,
      isActive,
    } = req.body ?? {};

    if (!imageSrc) {
      return res.status(400).json({ error: "imageSrc is required" });
    }

    const created = await Banner.create({
      title,
      subtitle,
      imageSrc,
      imageAlt,
      href,
      ctaText,
      order: Number.isFinite(Number(order)) ? Number(order) : 0,
      isActive: isActive ?? true,
    });

    res.status(201).json({ item: created });
  } catch (err) {
    next(err);
  }
};

export const updateBanner = async (req, res, next) => {
  try {
    const updates = { ...(req.body ?? {}) };
    if (Object.prototype.hasOwnProperty.call(updates, "order")) {
      updates.order = Number.isFinite(Number(updates.order))
        ? Number(updates.order)
        : 0;
    }

    const updated = await Banner.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ item: updated });
  } catch (err) {
    next(err);
  }
};

export const deleteBanner = async (req, res, next) => {
  try {
    const deleted = await Banner.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
