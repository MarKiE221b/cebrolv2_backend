import { getAuth, createClerkClient } from "@clerk/express";
import User from "../models/users.js";
import { ROLES, PERMISSIONS } from "../utils/roles.js";

// Initialized once — reuses the same secret key as clerkMiddleware
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * Resolves the Clerk JWT (set by clerkMiddleware) and attaches the MongoDB
 * user to req.dbUser. Also populates res.locals.session for backward
 * compatibility with controllers that read it.
 */
export async function authSession(req, res, next) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      req.dbUser = null;
      res.locals.session = null;
      return next();
    }

    // Primary lookup: by clerkId
    let user = await User.findOne({ clerkId: userId })
      .populate("office", "name code")
      .lean();

    // Fallback: user exists in MongoDB by email but clerkId not yet linked
    // (handles accounts created before Clerk migration)
    if (!user) {
      const clerkUser = await clerk.users.getUser(userId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress;

      if (primaryEmail) {
        user = await User.findOneAndUpdate(
          { email: primaryEmail, clerkId: { $in: [null, ""] } },
          { $set: { clerkId: userId } },
          { new: true }
        )
          .populate("office", "name code")
          .lean();
      }
    }

    req.dbUser = user ?? null;

    if (user) {
      res.locals.session = {
        user: {
          id:          String(user._id),
          name:        user.name,
          email:       user.email,
          role:        user.role,
          permissions: user.permissions ?? [],
          office:      user.office ? String(user.office._id ?? user.office) : null,
          position:    user.position ?? "",
        },
      };
    } else {
      res.locals.session = null;
    }

    next();
  } catch (err) {
    next(err);
  }
}

// ── Basic auth guard ───────────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId || !req.dbUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Role guard ─────────────────────────────────────────────────────────────

export function requireRole(...roles) {
  return (req, res, next) => {
    const { userId } = getAuth(req);
    if (!userId || !req.dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.dbUser.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
  };
}

// ── Permission guard ───────────────────────────────────────────────────────

export function requirePermission(permission) {
  return (req, res, next) => {
    const { userId } = getAuth(req);
    if (!userId || !req.dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.dbUser.role === ROLES.SUPER_ADMIN) return next();
    if (!(req.dbUser.permissions ?? []).includes(permission)) {
      return res.status(403).json({ error: `Forbidden: missing permission '${permission}'` });
    }
    next();
  };
}

// ── Legacy alias ───────────────────────────────────────────────────────────

export function requireAdmin(req, res, next) {
  return requireRole(ROLES.SUPER_ADMIN)(req, res, next);
}

export { ROLES, PERMISSIONS };

