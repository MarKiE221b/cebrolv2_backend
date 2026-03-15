import ActivityLog from "../models/activityLog.js";

const VALID_CATEGORIES = [
  "Login", "Upload", "Download", "Document",
  "Meeting", "Agenda", "Access", "User", "System",
];

// ── List activity logs (admin only) ──────────────────────────────────────
export const listLogs = async (req, res, next) => {
  try {
    const {
      category, action, actorId,
      from, to, search,
      page = 1, limit = 30,
    } = req.query;

    const filter = {};
    if (category && VALID_CATEGORIES.includes(category)) filter.category = category;
    if (action)   filter.action = action;
    if (actorId)  filter.actor  = actorId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { actorName: rx },
        { target:    rx },
      ];
    }

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(200, parseInt(limit, 10) || 30);

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: logs,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
};
