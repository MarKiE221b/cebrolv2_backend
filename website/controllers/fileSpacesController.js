import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import getS3Client from "../utils/storageConfig.js";
import { uploadMulterFileToSpaces } from "../utils/spacesStorage.js";

// Stream a file from DigitalOcean Spaces (supports PDF viewing in browser/iframe)
export const generateSignedUrl = async (req, res) => {
  try {
    const rawKey = String(req.query.fileKey || "").trim();
    if (!rawKey) {
      return res.status(400).json({ message: "Missing fileKey" });
    }

    const fileKey = rawKey.startsWith("/") ? rawKey.slice(1) : rawKey;
    const range = req.headers.range;

    const command = new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: fileKey,
      ...(range ? { Range: range } : {}),
    });

    const s3 = getS3Client();
    const data = await s3.send(command);

    res.status(range ? 206 : 200);
    res.setHeader("Content-Type", data.ContentType || "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Accept-Ranges", "bytes");

    if (data.ContentLength != null) {
      res.setHeader("Content-Length", String(data.ContentLength));
    }
    if (data.ContentRange) {
      res.setHeader("Content-Range", data.ContentRange);
    }

    data.Body.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).end(String(err?.message || err));
      } else {
        res.end();
      }
    });

    data.Body.pipe(res);
  } catch (error) {
    const httpStatus = error?.$metadata?.httpStatusCode;
    if (httpStatus === 404 || error?.name === "NoSuchKey") {
      return res.status(404).json({ message: "File not found" });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const uploadSingle = async (req, res) => {
  const visibility = String(req.query.visibility || "public").toLowerCase();
  const acl = visibility === "private" ? "private" : "public-read";

  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  const uploaded = await uploadMulterFileToSpaces(req.file, { acl });

  let signedUrl;
  if (acl === "private") {
    const s3 = getS3Client();
    signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.DO_SPACES_BUCKET,
        Key: uploaded.key,
      }),
      { expiresIn: 3600 }
    );
  }

  return res.status(201).json({
    ok: true,
    key: uploaded.key,
    url: uploaded.url,
    signedUrl,
    acl: uploaded.acl,
    proxyUrl: `/api/files?fileKey=${encodeURIComponent(uploaded.key)}`,
    signedUrlEndpoint: `/api/files/signed?fileKey=${encodeURIComponent(uploaded.key)}`,
  });
};

export const uploadMultiple = async (req, res) => {
  const visibility = String(req.query.visibility || "public").toLowerCase();
  const acl = visibility === "private" ? "private" : "public-read";

  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) {
    return res.status(400).json({ error: "Missing files" });
  }

  const results = [];
  for (const file of files) {
    const uploaded = await uploadMulterFileToSpaces(file, { acl });

    let signedUrl;
    if (acl === "private") {
      const s3 = getS3Client();
      signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.DO_SPACES_BUCKET,
          Key: uploaded.key,
        }),
        { expiresIn: 3600 }
      );
    }

    results.push({
      key: uploaded.key,
      url: uploaded.url,
      signedUrl,
      acl: uploaded.acl,
      proxyUrl: `/api/files?fileKey=${encodeURIComponent(uploaded.key)}`,
      signedUrlEndpoint: `/api/files/signed?fileKey=${encodeURIComponent(uploaded.key)}`,
    });
  }

  return res.status(201).json({ ok: true, items: results });
};

export const getPresignedUrl = async (req, res) => {
  try {
    const rawKey = String(req.query.fileKey || "").trim();
    if (!rawKey) return res.status(400).json({ error: "Missing fileKey" });

    const fileKey = rawKey.startsWith("/") ? rawKey.slice(1) : rawKey;
    const expiresIn = Math.min(
      Math.max(Number(req.query.expiresIn || 3600), 60),
      60 * 60 * 12
    ); // 1 min .. 12 hrs

    const command = new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: fileKey,
    });

    const s3 = getS3Client();
    const url = await getSignedUrl(s3, command, { expiresIn });
    return res.json({ ok: true, url, expiresIn });
  } catch (error) {
    const httpStatus = error?.$metadata?.httpStatusCode;
    if (httpStatus === 404 || error?.name === "NoSuchKey") {
      return res.status(404).json({ error: "File not found" });
    }
    return res.status(500).json({ error: error?.message || "Server error" });
  }
};
