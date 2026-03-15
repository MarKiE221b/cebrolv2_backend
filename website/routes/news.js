import express from "express";
import {
  authSession,
  requireAdmin,
} from "../../authentication/middlewares/authSession.js";
import {
  allNewsPosts,
  createNewsPost,
  deleteNewsPost,
  getNewsPostById,
  updateNewsPost,
} from "../controllers/news.js";

const router = express.Router();

// Public: list published posts (Admin can list all with ?all=1)
router.get("/", authSession, allNewsPosts);

// Public: get one
router.get("/:id", getNewsPostById);

// Admin: create
router.post("/", authSession, requireAdmin, createNewsPost);

// Admin: update
router.put("/:id", authSession, requireAdmin, updateNewsPost);

// Admin: delete
router.delete("/:id", authSession, requireAdmin, deleteNewsPost);

export default router;
