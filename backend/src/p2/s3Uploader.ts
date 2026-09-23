import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// AWS SDK reads only the configured archive credentials; no bucket credentials are hardcoded.
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/** Uploads one already-filtered session message array using the audit key convention. */
export async function uploadSessionArchive(
  sessionId: string,
  messages: unknown[]
): Promise<string> {
  const bucket = process.env.AWS_S3_ARCHIVE_BUCKET;
  if (!bucket) {
    throw new Error("Missing AWS_S3_ARCHIVE_BUCKET env var");
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `audit/${year}/${month}/${sessionId}.json`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      // This is the clean, filtered array; control/typing elements never reach S3.
      Body: JSON.stringify(messages, null, 2),
      ContentType: "application/json",
      Metadata: {
        sessionId,
        uploadedAt: now.toISOString(),
        messageCount: String(messages.length),
      },
    })
  );

  console.log(`[S3] ✅ Uploaded ${messages.length} msgs to s3://${bucket}/${key}`);
  return key;
}

/** Reads an existing archive through backend credentials; S3 keys are never exposed to the browser. */
export async function readSessionArchive(s3Key: string): Promise<unknown[]> {
  const bucket = process.env.AWS_S3_ARCHIVE_BUCKET;
  if (!bucket) throw new Error("Missing AWS_S3_ARCHIVE_BUCKET env var");

  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
  if (!response.Body) throw new Error("S3 archive object has no body");

  const parsed: unknown = JSON.parse(await response.Body.transformToString());
  if (!Array.isArray(parsed)) throw new Error("S3 archive payload is not a message array");
  return parsed;
}
