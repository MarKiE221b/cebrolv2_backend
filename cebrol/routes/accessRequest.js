import { Router } from "express";
import {
  requestAccess,
  listRequests,
  reviewRequest,
  revokeAccess,
} from "../controllers/accessRequest.js";
import { requireRole, ROLES } from "../../authentication/middlewares/authSession.js";

const router = Router();

// Any authenticated user can submit or view their own requests
router.post ("/", requestAccess);
router.get  ("/", listRequests);

// Secretary / admin only for review and revoke
router.patch("/:id/review", requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), reviewRequest);
router.patch("/:id/revoke", requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), revokeAccess);

export default router;
