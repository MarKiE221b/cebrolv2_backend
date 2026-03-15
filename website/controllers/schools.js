import School from "../models/school.js";

export const allSchools = async (req, res, next) => {
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
		const items = await School.find(filter).sort({ createdAt: -1 }).lean();
		res.json({ items });
	} catch (err) {
		next(err);
	}
};

export const getSchoolById = async (req, res, next) => {
	try {
		const item = await School.findById(req.params.id).lean();
		if (!item || item.isActive === false)
			return res.status(404).json({ error: "Not found" });
		res.json({ item });
	} catch (err) {
		next(err);
	}
};

export const createSchool = async (req, res, next) => {
	try {
		const { name, type, description, websiteUrl, logoUrl, isActive } =
			req.body ?? {};
		if (!name) return res.status(400).json({ error: "Name is required" });

		const created = await School.create({
			name,
			type,
			description,
			websiteUrl,
			logoUrl,
			isActive: isActive ?? true,
		});

		res.status(201).json({ item: created });
	} catch (err) {
		next(err);
	}
};

export const updateSchool = async (req, res, next) => {
	try {
		const updates = req.body ?? {};
		const updated = await School.findByIdAndUpdate(req.params.id, updates, {
			new: true,
			runValidators: true,
		});
		if (!updated) return res.status(404).json({ error: "Not found" });
		res.json({ item: updated });
	} catch (err) {
		next(err);
	}
};

export const deleteSchool = async (req, res, next) => {
	try {
		const deleted = await School.findByIdAndDelete(req.params.id);
		if (!deleted) return res.status(404).json({ error: "Not found" });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
};

