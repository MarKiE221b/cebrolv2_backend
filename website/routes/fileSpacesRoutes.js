import express from "express";
import multer from "multer";
import {
	generateSignedUrl,
	getPresignedUrl,
	uploadMultiple,
	uploadSingle,
} from "../controllers/fileSpacesController.js";
import {
	authSession,
	requireAdmin,
	requireAuth,
} from "../../authentication/middlewares/authSession.js";

const router = express.Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// Stream a file from Spaces (protected)
router.get("/", authSession, requireAuth, generateSignedUrl);

// Get a presigned URL for a file key (public endpoint)
router.get("/signed", getPresignedUrl);

// Upload to Spaces (admin-only)
router.post(
	"/upload",
	authSession,
	requireAdmin,
	upload.single("file"),
	uploadSingle
);

router.post(
	"/upload-multiple",
	authSession,
	requireAdmin,
	upload.array("files", 12),
	uploadMultiple
);

export default router;
