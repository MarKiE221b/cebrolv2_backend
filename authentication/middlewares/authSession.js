import { getSession } from "@auth/express";
import { authConfig } from "../configs/config.js";
import { ROLES, PERMISSIONS } from "../utils/roles.js";

export async function authSession(req, res, next) {
  try {
    res.locals.session = await getSession(req, authConfig);
    next();
  } catch (err) {
    next(err);
  }
}

// ── Basic auth guard ───────────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  const session = res.locals.session;
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Role guard ─────────────────────────────────────────────────────────────

/**
 * Middleware factory: allow one or more roles.
 * @param {...string} roles - Role constants from ROLES.
 *
 * Usage:
 *   router.get("/users", authSession, requireRole(ROLES.SUPER_ADMIN), handler);
 *   router.get("/repo",  authSession, requireRole(ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY), handler);
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    const session = res.locals.session;
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(session.user.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
  };
}

// ── Permission guard ───────────────────────────────────────────────────────

/**
 * Middleware factory: require a specific granular permission flag.
 * Super admins always pass.
 * @param {string} permission - Permission constant from PERMISSIONS.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    const session = res.locals.session;
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // Super admins bypass all permission checks.
    if (session.user.role === ROLES.SUPER_ADMIN) return next();

    const userPermissions = session.user.permissions ?? [];
    if (!userPermissions.includes(permission)) {
      return res
        .status(403)
        .json({ error: `Forbidden: missing permission '${permission}'` });
    }
    next();
  };
}

// ── Legacy alias (kept for backward compatibility) ─────────────────────────

export function requireAdmin(req, res, next) {
  return requireRole(ROLES.SUPER_ADMIN)(req, res, next);
}

// Re-export constants so route files only need this one import.
export { ROLES, PERMISSIONS };
