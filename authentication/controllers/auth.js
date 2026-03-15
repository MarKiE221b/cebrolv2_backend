import User from "../models/users.js";
import { hashPassword } from "../utils/password.js";
import { ROLES, DEFAULT_ROLE_PERMISSIONS } from "../utils/roles.js";

// ── Register (initial seed / super-admin only in production) ──────────────

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, office, position, contactNumber } =
      req.body ?? {};

    const normalizedEmail = String(email ?? "")
      .toLowerCase()
      .trim();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const assignedRole = Object.values(ROLES).includes(role)
      ? role
      : ROLES.ASSIGNED_USER;

    const passwordHash = await hashPassword(password);

    const createdBy = res.locals.session?.user?.id ?? null;

    const user = await User.create({
      name:          String(name ?? "").trim() || normalizedEmail,
      email:         normalizedEmail,
      passwordHash,
      role:          assignedRole,
      permissions:   DEFAULT_ROLE_PERMISSIONS[assignedRole] ?? [],
      office:        office ?? null,
      position:      position ?? "",
      contactNumber: contactNumber ?? "",
      createdBy,
    });

    return res.status(201).json({
      ok: true,
      user: {
        id:       String(user._id),
        name:     user.name,
        email:    user.email,
        role:     user.role,
        office:   user.office,
        position: user.position,
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Email already in use" });
    }
    next(err);
  }
};
