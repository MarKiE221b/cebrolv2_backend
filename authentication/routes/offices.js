import express from "express";
import { authSession, requireRole, ROLES } from "../middlewares/authSession.js";
import {
  listOffices,
  getOffice,
  createOffice,
  updateOffice,
  deleteOffice,
} from "../controllers/offices.js";

const router = express.Router();

// Load session on every request.
router.use(authSession);

// All authenticated roles can view offices.
router.get(
  "/",
  requireRole(
    ROLES.SUPER_ADMIN,
    ROLES.COMMUNICATIONS_SECRETARY,
    ROLES.ASSIGNED_USER,
  ),
  listOffices,
);

router.get(
  "/:id",
  requireRole(
    ROLES.SUPER_ADMIN,
    ROLES.COMMUNICATIONS_SECRETARY,
    ROLES.ASSIGNED_USER,
  ),
  getOffice,
);

// Only super_admin can manage offices.
router.post("/", requireRole(ROLES.SUPER_ADMIN), createOffice);
router.put("/:id", requireRole(ROLES.SUPER_ADMIN), updateOffice);
router.delete("/:id", requireRole(ROLES.SUPER_ADMIN), deleteOffice);

export default router;
