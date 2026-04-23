import { Router } from "express";
import multer from "multer";
import {
  listAgendas,
  uploadAgenda,
  updateAgenda,
  downloadAgenda,
  deleteAgenda,
  extractAttendees,
} from "../controllers/agenda.js";
import { requireRole, ROLES } from "../../authentication/middlewares/authSession.js";

const storage = multer.memoryStorage();
const upload  = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

const router = Router();

router.get   ("/",                    listAgendas);
router.post  ("/",                    requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), upload.single("file"), uploadAgenda);
router.get   ("/:id/download",        downloadAgenda);
router.get   ("/:id/attendees",       extractAttendees);
router.put   ("/:id",                 requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), updateAgenda);
router.delete("/:id",                 requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), deleteAgenda);

export default router;
