import { S3Client } from "@aws-sdk/client-s3";

let cachedClient;

export default function getS3Client() {
  if (cachedClient) return cachedClient;

  cachedClient = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: process.env.DO_SPACES_REGION,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
    },
  });

  return cachedClient;
}
