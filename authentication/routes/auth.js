import express from "express";
import { authSession, requireAuth, requireRole, ROLES } from "../middlewares/authSession.js";
import { register } from "../controllers/auth.js";
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  resetPassword,
  deactivateUser,
  activateUser,
  deleteUser,
} from "../controllers/users.js";

const router = express.Router();

// Load session on every request in this router.
router.use(authSession);

// ── Public / auth ──────────────────────────────────────────────────────────

/** Bootstrap: create the very first super-admin (unprotected, use once). */
router.post("/register", register);

/** Returns current session info. Works for all apps — returns {ok:false} when not logged in instead of 401. */
router.get("/me", (req, res) => {
  const session = res.locals.session;
  if (!session?.user) return res.json({ ok: false });
  return res.json({ ok: true, user: session.user });
});

// ── User management (super_admin only for write; comms_sec can read) ───────

router.get(
  "/users",
  requireRole(ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY),
  listUsers,
);

router.get(
  "/users/:id",
  requireRole(ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY),
  getUser,
);

router.post(
  "/users",
  requireRole(ROLES.SUPER_ADMIN),
  createUser,
);

router.put(
  "/users/:id",
  requireRole(ROLES.SUPER_ADMIN),
  updateUser,
);

router.patch(
  "/users/:id/password",
  requireRole(ROLES.SUPER_ADMIN),
  resetPassword,
);

router.patch(
  "/users/:id/deactivate",
  requireRole(ROLES.SUPER_ADMIN),
  deactivateUser,
);

router.patch(
  "/users/:id/activate",
  requireRole(ROLES.SUPER_ADMIN),
  activateUser,
);

router.delete(
  "/users/:id",
  requireRole(ROLES.SUPER_ADMIN),
  deleteUser,
);

export default router;
