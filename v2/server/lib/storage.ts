/**
 * Photo storage. Uses an S3-compatible bucket when configured (Railway Storage Buckets are
 * private, so reads go through short-lived presigned URLs) and a local folder otherwise.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

const s3 = env.s3Enabled
  ? new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    })
  : null;

const localPath = (key: string) => {
  const root = path.resolve(env.UPLOAD_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("bad storage key");
  return full;
};

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: "private, max-age=31536000, immutable" }));
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return;
  if (s3) {
    await s3.send(new DeleteObjectsCommand({ Bucket: env.S3_BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    return;
  }
  await Promise.all(keys.map((k) => rm(localPath(k), { force: true })));
}

/** Either a presigned URL to redirect to (bucket) or the bytes to send (local). */
export async function readObject(key: string): Promise<{ redirect: string } | { body: Buffer }> {
  if (s3) {
    return { redirect: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: 3600 }) };
  }
  return { body: await readFile(localPath(key)) };
}

/** Deletes the stored files for photo rows about to be removed (by event, league or uploader). Never throws. */
export async function deletePhotoFiles(where: { eventId?: string; leagueId?: string; uploaderId?: string }) {
  try {
    const { db, schema } = await import("../db/client.js");
    const { eq } = await import("drizzle-orm");
    const column = where.eventId ? schema.photos.eventId : where.leagueId ? schema.photos.leagueId : schema.photos.uploaderId;
    const value = (where.eventId ?? where.leagueId ?? where.uploaderId)!;
    const rows = await db.select({ key: schema.photos.storageKey }).from(schema.photos).where(eq(column, value));
    for (let i = 0; i < rows.length; i += 400) {
      await deleteObjects(rows.slice(i, i + 400).flatMap((r) => [`${r.key}.webp`, `${r.key}_thumb.webp`]));
    }
  } catch (err) {
    console.error("photo file cleanup failed", err);
  }
}
