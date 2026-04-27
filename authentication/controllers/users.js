import { createClerkClient } from "@clerk/express";
import User from "../models/users.js";
import { ROLES, DEFAULT_ROLE_PERMISSIONS } from "../utils/roles.js";
import { logActivity } from "../../cebrol/utils/activityLogger.js";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// ── List all users ─────────────────────────────────────────────────────────

export const listUsers = async (req, res, next) => {
  try {
    const { role, office, isActive, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (role && Object.values(ROLES).includes(role)) filter.role = role;
    if (office) filter.office = office;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(filter)
        .populate("office", "name code")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      data: users,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
};

// ── Get single user ────────────────────────────────────────────────────────

export const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("office", "name code description")
      .populate("createdBy", "name email")
      .lean();

    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ ok: true, data: user });
  } catch (err) {
    next(err);
  }
};

// ── Create user ────────────────────────────────────────────────────────────

export const createUser = async (req, res, next) => {
  try {
    const {
      name, email, password, role,
      office, position, contactNumber, permissions,
    } = req.body ?? {};

    const normalizedEmail = String(email ?? "").toLowerCase().trim();
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

    const resolvedPermissions = Array.isArray(permissions)
      ? permissions
      : DEFAULT_ROLE_PERMISSIONS[assignedRole] ?? [];

    // Create user in Clerk first
    let clerkUser;
    try {
      const nameParts = String(name ?? "").trim().split(" ");
      clerkUser = await clerk.users.createUser({
        emailAddress: [normalizedEmail],
        password,
        firstName: nameParts[0] || normalizedEmail,
        lastName:  nameParts.slice(1).join(" ") || "",
        publicMetadata: {
          role:        assignedRole,
          permissions: resolvedPermissions,
          office:      office ? String(office) : null,
          position:    position ?? "",
        },
      });
    } catch (clerkErr) {
      const msg = clerkErr?.errors?.[0]?.longMessage
        ?? clerkErr?.errors?.[0]?.message
        ?? "Failed to create user in auth system";
      return res.status(400).json({ error: msg });
    }

    const createdBy = req.dbUser?._id ?? null;

    const user = await User.create({
      clerkId:       clerkUser.id,
      name:          String(name ?? "").trim() || normalizedEmail,
      email:         normalizedEmail,
      role:          assignedRole,
      permissions:   resolvedPermissions,
      office:        office ?? null,
      position:      position ?? "",
      contactNumber: contactNumber ?? "",
      createdBy,
    });

    const populated = await User.findById(user._id)
      .populate("office", "name code")
      .lean();

    logActivity(res.locals.session, req, "user_create", `${user.name} <${user.email}>`, { userId: user._id, role: user.role });
    return res.status(201).json({ ok: true, data: populated });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Email already in use" });
    }
    next(err);
  }
};

// ── Update user ────────────────────────────────────────────────────────────

export const updateUser = async (req, res, next) => {
  try {
    const allowed = [
      "name", "role", "office", "position",
      "contactNumber", "permissions", "isActive",
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // If the role changed and no explicit permissions provided, reset to defaults.
    if (updates.role && !req.body.permissions) {
      updates.permissions = DEFAULT_ROLE_PERMISSIONS[updates.role] ?? [];
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true },
    )
      .populate("office", "name code")
      .lean();

    if (!user) return res.status(404).json({ error: "User not found" });

    // Sync role/permissions/office/position to Clerk publicMetadata
    if (user.clerkId && (updates.role || updates.permissions || updates.office !== undefined || updates.position !== undefined)) {
      try {
        await clerk.users.updateUserMetadata(user.clerkId, {
          publicMetadata: {
            role:        user.role,
            permissions: user.permissions ?? [],
            office:      user.office ? String(user.office._id ?? user.office) : null,
            position:    user.position ?? "",
          },
        });
      } catch { /* non-fatal – DB is source of truth */ }
    }

    logActivity(res.locals.session, req, "user_update", `${user.name} <${user.email}>`, { userId: user._id });
    return res.json({ ok: true, data: user });
  } catch (err) {
    next(err);
  }
};

// ── Change password (admin reset) ─────────────────────────────────────────

export const resetPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body ?? {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.params.id).select("name email clerkId").lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.clerkId) {
      try {
        await clerk.users.updateUser(user.clerkId, { password: newPassword });
      } catch (clerkErr) {
        const msg = clerkErr?.errors?.[0]?.longMessage
          ?? clerkErr?.errors?.[0]?.message
          ?? "Failed to update password in auth system";
        return res.status(400).json({ error: msg });
      }
    }

    logActivity(res.locals.session, req, "password_reset", `Password reset for ${user.name} <${user.email}>`, { userId: req.params.id });
    return res.json({ ok: true, message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};

// ── Soft-deactivate user ───────────────────────────────────────────────────

export const deactivateUser = async (req, res, next) => {
  try {
    const { reason } = req.body ?? {};
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false, deactivationReason: reason ?? "" } },
      { new: true },
    ).select("name email isActive clerkId").lean();

    if (!user) return res.status(404).json({ error: "User not found" });

    // Ban user in Clerk so they cannot sign in
    if (user.clerkId) {
      try {
        await clerk.users.banUser(user.clerkId);
      } catch { /* non-fatal */ }
    }

    logActivity(res.locals.session, req, "user_deactivate", `${user.name} <${user.email}>`, { userId: user._id });
    return res.json({ ok: true, data: user });
  } catch (err) {
    next(err);
  }
};

// ── Restore (re-activate) user ─────────────────────────────────────────────

export const activateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: true, deactivationReason: "" } },
      { new: true },
    ).select("name email isActive clerkId").lean();

    if (!user) return res.status(404).json({ error: "User not found" });

    // Unban user in Clerk
    if (user.clerkId) {
      try {
        await clerk.users.unbanUser(user.clerkId);
      } catch { /* non-fatal */ }
    }

    logActivity(res.locals.session, req, "user_activate", `${user.name} <${user.email}>`, { userId: user._id });
    return res.json({ ok: true, data: user });
  } catch (err) {
    next(err);
  }
};

// ── Delete user (hard) – super_admin only ─────────────────────────────────

export const deleteUser = async (req, res, next) => {
  try {
    const callerRole = req.dbUser?.role;
    if (callerRole !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ error: "Only super admins may permanently delete users" });
    }

    const user = await User.findByIdAndDelete(req.params.id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    // Delete from Clerk as well
    if (user.clerkId) {
      try {
        await clerk.users.deleteUser(user.clerkId);
      } catch { /* non-fatal – user may have already been deleted in Clerk */ }
    }

    logActivity(res.locals.session, req, "user_delete", `${user.name} <${user.email}>`, { userId: user._id });
    return res.json({ ok: true, message: "User deleted" });
  } catch (err) {
    next(err);
  }
};

