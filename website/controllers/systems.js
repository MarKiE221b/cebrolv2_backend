import System from "../models/system.js";

export const allSystems = async (req, res, next) => {
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
		const items = await System.find(filter).sort({ createdAt: -1 }).lean();
		res.json({ items });
	} catch (err) {
		next(err);
	}
};

export const getSystemById = async (req, res, next) => {
	try {
		const item = await System.findById(req.params.id).lean();
		if (!item || item.isActive === false)
			return res.status(404).json({ error: "Not found" });
		res.json({ item });
	} catch (err) {
		next(err);
	}
};

export const createSystem = async (req, res, next) => {
	try {
		const { name, description, url, logoUrl, category, status, isActive } =
			req.body ?? {};
		if (!name || !url)
			return res.status(400).json({ error: "Name and url are required" });

		const created = await System.create({
			name,
			description,
			url,
			logoUrl,
			category,
			status,
			isActive: isActive ?? true,
		});

		res.status(201).json({ item: created });
	} catch (err) {
		next(err);
	}
};

export const updateSystem = async (req, res, next) => {
	try {
		const updates = req.body ?? {};
		const updated = await System.findByIdAndUpdate(req.params.id, updates, {
			new: true,
			runValidators: true,
		});
		if (!updated) return res.status(404).json({ error: "Not found" });
		res.json({ item: updated });
	} catch (err) {
		next(err);
	}
};

export const deleteSystem = async (req, res, next) => {
	try {
		const deleted = await System.findByIdAndDelete(req.params.id);
		if (!deleted) return res.status(404).json({ error: "Not found" });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
};

