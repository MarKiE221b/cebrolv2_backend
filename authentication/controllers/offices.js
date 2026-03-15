import Office from "../models/offices.js";
import User from "../models/users.js";

// ── List offices ────────────────────────────────────────────────────────────

export const listOffices = async (req, res, next) => {
  try {
    const { isActive, search } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (search) filter.name = { $regex: search, $options: "i" };

    const offices = await Office.find(filter)
      .populate("head", "name email position")
      .sort({ name: 1 })
      .lean();

    return res.json({ ok: true, data: offices });
  } catch (err) {
    next(err);
  }
};

// ── Get single office ───────────────────────────────────────────────────────

export const getOffice = async (req, res, next) => {
  try {
    const office = await Office.findById(req.params.id)
      .populate("head", "name email position")
      .lean();

    if (!office) return res.status(404).json({ error: "Office not found" });

    // Also return the users in this office.
    const members = await User.find({ office: req.params.id, isActive: true })
      .select("name email role position")
      .lean();

    return res.json({ ok: true, data: { ...office, members } });
  } catch (err) {
    next(err);
  }
};

// ── Create office ───────────────────────────────────────────────────────────

export const createOffice = async (req, res, next) => {
  try {
    const { name, code, description, head } = req.body ?? {};
    if (!name || !code) {
      return res.status(400).json({ error: "Name and code are required" });
    }

    const existing = await Office.findOne({ code: String(code).toUpperCase() }).lean();
    if (existing) {
      return res.status(409).json({ error: "An office with this code already exists" });
    }

    const office = await Office.create({
      name:        String(name).trim(),
      code:        String(code).trim().toUpperCase(),
      description: description ?? "",
      head:        head ?? null,
    });

    return res.status(201).json({ ok: true, data: office });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "An office with this name or code already exists" });
    }
    next(err);
  }
};

// ── Update office ───────────────────────────────────────────────────────────

export const updateOffice = async (req, res, next) => {
  try {
    const { name, description, head, isActive } = req.body ?? {};

    const updates = {};
    if (name !== undefined)        updates.name        = String(name).trim();
    if (description !== undefined) updates.description = description;
    if (head !== undefined)        updates.head        = head;
    if (isActive !== undefined)    updates.isActive    = isActive;

    const office = await Office.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true },
    )
      .populate("head", "name email position")
      .lean();

    if (!office) return res.status(404).json({ error: "Office not found" });
    return res.json({ ok: true, data: office });
  } catch (err) {
    next(err);
  }
};

// ── Delete office ───────────────────────────────────────────────────────────

export const deleteOffice = async (req, res, next) => {
  try {
    // Prevent deletion if any users are still assigned.
    const memberCount = await User.countDocuments({ office: req.params.id });
    if (memberCount > 0) {
      return res.status(409).json({
        error: `Cannot delete office with ${memberCount} assigned user(s). Re-assign them first.`,
      });
    }

    const office = await Office.findByIdAndDelete(req.params.id).lean();
    if (!office) return res.status(404).json({ error: "Office not found" });
    return res.json({ ok: true, message: "Office deleted" });
  } catch (err) {
    next(err);
  }
};
