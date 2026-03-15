import { Router } from "express";
import { listLogs } from "../controllers/activityLog.js";
import { requireRole, ROLES } from "../../authentication/middlewares/authSession.js";

const router = Router();

// Only super_admin and communications_secretary may read logs
router.get("/", requireRole(ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY), listLogs);

export default router;
