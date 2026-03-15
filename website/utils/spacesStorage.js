import path from "path";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import getS3Client from "./storageConfig.js";

const getBucket = () => String(process.env.DO_SPACES_BUCKET || "").trim();

const joinUrl = (base, part) => {
  const a = String(base || "").replace(/\/+$/, "");
  const b = String(part || "").replace(/^\//, "");
  return `${a}/${b}`;
};

const urlHasBucket = (baseUrl, bucket) => {
  try {
    const u = new URL(baseUrl);
    if (u.hostname.startsWith(`${bucket}.`)) return true;
    const firstPath = u.pathname.split("/").filter(Boolean)[0];
    return firstPath === bucket;
  } catch {
    return false;
  }
};

export const getSpacesPublicUrlForKey = (key) => {
  const bucket = getBucket();
  const publicBase = String(
    process.env.DO_SPACES_PUBLIC_BASE || process.env.DO_SPACES_CDN_ENDPOINT || ""
  ).trim();
  const endpoint = String(process.env.DO_SPACES_ENDPOINT || "").trim();

  const normalizedKey = String(key || "").trim().replace(/^\//, "");
  if (!normalizedKey) return "";

  if (publicBase) {
    const base = publicBase.replace(/\/+$/, "");
    if (!bucket) return joinUrl(base, normalizedKey);
    return urlHasBucket(base, bucket)
      ? joinUrl(base, normalizedKey)
      : joinUrl(joinUrl(base, bucket), normalizedKey);
  }

  if (!endpoint || !bucket) return "";
  const base = endpoint.replace(/\/+$/, "");

  // Support both: https://region.digitaloceanspaces.com + /bucket/key
  // and: https://bucket.region.digitaloceanspaces.com + /key
  return urlHasBucket(base, bucket)
    ? joinUrl(base, normalizedKey)
    : joinUrl(joinUrl(base, bucket), normalizedKey);
};

const sanitizeFilenamePart = (value) => {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
};

export const createUploadsKey = (originalname) => {
  const ext = path.extname(originalname || "").toLowerCase();
  const base = path.basename(originalname || "file", ext);
  const safeBase = sanitizeFilenamePart(base) || "file";
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

  // Single prefix requirement: everything under uploads/
  return `uploads/${uniqueSuffix}-${safeBase}${ext}`;
};

export const uploadMulterFileToSpaces = async (
  file,
  { acl = "public-read" } = {}
) => {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error("DO_SPACES_BUCKET is not set");
  }
  if (!file?.buffer) {
    throw new Error("No file buffer to upload (multer must use memoryStorage)");
  }

  const key = createUploadsKey(file.originalname);

  const uploader = new Upload({
    client: getS3Client(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || "application/octet-stream",
      ACL: acl,
    },
  });

  await uploader.done();
  const url = acl === "public-read" ? getSpacesPublicUrlForKey(key) : "";
  return { key, url, acl };
};

export const deleteSpacesObject = async (key) => {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error("DO_SPACES_BUCKET is not set");
  }
  if (!key) return;

  const normalizedKey = String(key).trim().replace(/^\//, "");
  if (!normalizedKey) return;

  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
    })
  );
};
