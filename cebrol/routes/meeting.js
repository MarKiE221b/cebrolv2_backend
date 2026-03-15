import { Router } from "express";
import {
  listMeetings,
  getMeeting,
  createMeeting,
  updateMeeting,
  deleteMeeting,
} from "../controllers/meeting.js";
import { requireRole, ROLES } from "../../authentication/middlewares/authSession.js";

const router = Router();

// All authenticated users can list / view meetings
router.get  ("/",    listMeetings);
router.get  ("/:id", getMeeting);

// Only secretary / admin can create, update, delete
router.post  ("/",    requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), createMeeting);
router.put   ("/:id", requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), updateMeeting);
router.delete("/:id", requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), deleteMeeting);

export default router;
