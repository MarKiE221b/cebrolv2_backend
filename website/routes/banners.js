import express from "express";
import {
  authSession,
  requireAdmin,
} from "../../authentication/middlewares/authSession.js";
import {
  allBanners,
  createBanner,
  deleteBanner,
  getBannerById,
  updateBanner,
} from "../controllers/banners.js";

const router = express.Router();

// Public: list active banners (Admin can list all with ?all=1)
router.get("/", authSession, allBanners);

// Public: get one
router.get("/:id", getBannerById);

// Admin: create
router.post("/", authSession, requireAdmin, createBanner);

// Admin: update
router.put("/:id", authSession, requireAdmin, updateBanner);

// Admin: delete
router.delete("/:id", authSession, requireAdmin, deleteBanner);

export default router;
