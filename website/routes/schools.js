import express from "express";
import {
  authSession,
  requireAdmin,
} from "../../authentication/middlewares/authSession.js";
import {
  allSchools,
  createSchool,
  deleteSchool,
  getSchoolById,
  updateSchool,
} from "../controllers/schools.js";

const router = express.Router();

// Public: list active schools (Admin can list all with ?all=1)
router.get("/", authSession, allSchools);

// Public: get one
router.get("/:id", getSchoolById);

// Admin: create
router.post("/", authSession, requireAdmin, createSchool);

// Admin: update
router.put("/:id", authSession, requireAdmin, updateSchool);

// Admin: delete
router.delete("/:id", authSession, requireAdmin, deleteSchool);

export default router;
