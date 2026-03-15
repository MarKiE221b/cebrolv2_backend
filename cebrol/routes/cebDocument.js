import { Router } from "express";
import multer from "multer";
import {
  listDocuments,
  getDocument,
  uploadDocument,
  downloadDocument,
  updateDocument,
  deleteDocument,
} from "../controllers/cebDocument.js";
import { requireRole, ROLES } from "../../authentication/middlewares/authSession.js";

const storage = multer.memoryStorage();
const upload  = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100 MB

const router = Router();

// All authenticated users can browse metadata + download (download enforces its own access check)
router.get ("/"   ,         listDocuments);
router.get ("/:id",         getDocument);
router.get ("/:id/download", downloadDocument);

// Secretary / admin only for mutations
router.post  ("/",     requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), upload.single("file"), uploadDocument);
router.put   ("/:id",  requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), updateDocument);
router.delete("/:id",  requireRole(ROLES.COMMUNICATIONS_SECRETARY, ROLES.SUPER_ADMIN), deleteDocument);

export default router;
