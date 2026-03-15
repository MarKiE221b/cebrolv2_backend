import express from "express";
import {
  authSession,
  requireAdmin,
} from "../../authentication/middlewares/authSession.js";
import {
  allSystems,
  createSystem,
  deleteSystem,
  getSystemById,
  updateSystem,
} from "../controllers/systems.js";

const router = express.Router();

// Public: list active systems (Admin can list all with ?all=1)
router.get("/", authSession, allSystems);

// Public: get one
router.get("/:id", getSystemById);

// Admin: create
router.post("/", authSession, requireAdmin, createSystem);

// Admin: update
router.put("/:id", authSession, requireAdmin, updateSystem);

// Admin: delete
router.delete("/:id", authSession, requireAdmin, deleteSystem);

export default router;
