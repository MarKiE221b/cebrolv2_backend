import { createClerkClient } from "@clerk/express";
import User from "../models/users.js";
import { ROLES, DEFAULT_ROLE_PERMISSIONS } from "../utils/roles.js";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// ── Register (bootstrap: create the first super-admin account) ────────────
// In production, create users via the admin dashboard or Clerk dashboard.

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, office, position, contactNumber } =
      req.body ?? {};

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

    const resolvedPermissions = DEFAULT_ROLE_PERMISSIONS[assignedRole] ?? [];

    // Create user in Clerk
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

    const user = await User.create({
      clerkId:       clerkUser.id,
      name:          String(name ?? "").trim() || normalizedEmail,
      email:         normalizedEmail,
      role:          assignedRole,
      permissions:   resolvedPermissions,
      office:        office ?? null,
      position:      position ?? "",
      contactNumber: contactNumber ?? "",
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

