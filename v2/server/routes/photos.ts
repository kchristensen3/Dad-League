import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import sharp from "sharp";
import type { Photo } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { forbidden, notFound, uuidParam } from "../lib/access.js";
import { iso, userSummary } from "../lib/http.js";
import { notifyLeague } from "../lib/push.js";
import { publish } from "../lib/realtime.js";
import { deleteObjects, putObject, readObject } from "../lib/storage.js";
import { canModify, scopedRouter } from "./scope.js";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const photoUrl = (leagueId: string, id: string, size: "thumb" | "full") => `/api/leagues/${leagueId}/photos/${id}/${size}`;

export async function listPhotos(
  leagueId: string,
  filter: { eventId?: string; from?: Date; to?: Date; limit?: number; random?: boolean },
): Promise<Photo[]> {
  const p = schema.photos;
  const rows = await db
    .select({ photo: p, eventTitle: schema.events.title, uploader: userSummary })
    .from(p)
    .innerJoin(schema.events, eq(schema.events.id, p.eventId))
    .innerJoin(schema.users, eq(schema.users.id, p.uploaderId))
    .where(
      and(
        eq(p.leagueId, leagueId),
        filter.eventId ? eq(p.eventId, filter.eventId) : undefined,
        filter.from ? gte(schema.events.startsAt, filter.from) : undefined,
        filter.to ? lt(schema.events.startsAt, filter.to) : undefined,
      ),
    )
    .orderBy(filter.random ? desc(schema.events.startsAt) : desc(p.createdAt))
    .limit(filter.limit ?? 200);
  const list = filter.random ? rows.sort(() => Math.random() - 0.5) : rows;
  return list.map(({ photo, eventTitle, uploader }) => ({
    id: photo.id,
    eventId: photo.eventId,
    eventTitle,
    uploader,
    width: photo.width,
    height: photo.height,
    thumbUrl: photoUrl(leagueId, photo.id, "thumb"),
    fullUrl: photoUrl(leagueId, photo.id, "full"),
    createdAt: iso(photo.createdAt),
  }));
}

/**
 * Re-encodes an upload: honors EXIF rotation, caps the size, and drops all metadata
 * (phone photos carry GPS coordinates; nobody needs those in a group album).
 */
export async function processImage(input: Buffer) {
  const base = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  const full = await base.clone().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: 480, height: 480, fit: "cover" }).webp({ quality: 72 }).toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

async function loadEvent(leagueId: string, eventId: string) {
  const event = await db.query.events.findFirst({ where: and(eq(schema.events.id, eventId), eq(schema.events.leagueId, leagueId)) });
  return event ?? notFound("Event not found");
}

export const photoRoutes = scopedRouter()
  .get("/", async (c) => {
    const eventId = c.req.query("eventId");
    return c.json({ photos: await listPhotos(c.var.leagueId, { eventId: eventId ? uuidParam(eventId) : undefined }), enabled: env.photosEnabled });
  })

  .post(
    "/",
    bodyLimit({ maxSize: MAX_FILES * MAX_FILE_BYTES + 1024 * 1024, onError: () => { throw new HTTPException(413, { message: "That's too much at once. Try fewer photos." }); } }),
    async (c) => {
      if (!env.photosEnabled) throw new HTTPException(503, { message: "Photo uploads aren't set up on this server yet" });
      const form = await c.req.parseBody({ all: true });
      const eventId = uuidParam(typeof form.eventId === "string" ? form.eventId : undefined);
      const event = await loadEvent(c.var.leagueId, eventId);
      const files = ([] as unknown[]).concat(form.photos ?? []).filter((f): f is File => f instanceof File);
      if (files.length === 0) throw new HTTPException(400, { message: "Pick at least one photo" });
      if (files.length > MAX_FILES) throw new HTTPException(400, { message: `Up to ${MAX_FILES} photos at a time` });

      const saved: string[] = [];
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) throw new HTTPException(413, { message: `${file.name} is over 15 MB` });
        let processed;
        try {
          processed = await processImage(Buffer.from(await file.arrayBuffer()));
        } catch {
          throw new HTTPException(400, { message: `${file.name || "One file"} isn't a photo we can read` });
        }
        const key = `photos/${c.var.leagueId}/${event.id}/${randomUUID()}`;
        await putObject(`${key}.webp`, processed.full, "image/webp");
        await putObject(`${key}_thumb.webp`, processed.thumb, "image/webp");
        const [row] = await db
          .insert(schema.photos)
          .values({ leagueId: c.var.leagueId, eventId: event.id, uploaderId: c.var.user.id, storageKey: key, width: processed.width, height: processed.height })
          .returning({ id: schema.photos.id });
        saved.push(row!.id);
      }
      await publish({ leagueId: c.var.leagueId, kind: "photos", ref: event.id });
      void notifyLeague(c.var.leagueId, c.var.user.id, "posts", {
        title: `📸 ${c.var.user.name} added ${saved.length === 1 ? "a photo" : `${saved.length} photos`}`,
        body: event.title,
        url: `/l/${c.var.leagueId}/events/${event.id}`,
        tag: `photos-${event.id}`,
      });
      return c.json({ photos: await listPhotos(c.var.leagueId, { eventId: event.id }) }, 201);
    },
  )

  .get("/:photoId/:size{thumb|full}", async (c) => {
    const photo = await db.query.photos.findFirst({
      where: and(eq(schema.photos.id, uuidParam(c.req.param("photoId"))), eq(schema.photos.leagueId, c.var.leagueId)),
    });
    if (!photo) notFound("Photo not found");
    const key = `${photo.storageKey}${c.req.param("size") === "thumb" ? "_thumb" : ""}.webp`;
    const obj = await readObject(key);
    c.header("Cache-Control", "private, max-age=3000");
    if ("redirect" in obj) return c.redirect(obj.redirect, 302);
    return c.body(new Uint8Array(obj.body), 200, { "content-type": "image/webp" });
  })

  .delete("/:photoId", async (c) => {
    const photo = await db.query.photos.findFirst({
      where: and(eq(schema.photos.id, uuidParam(c.req.param("photoId"))), eq(schema.photos.leagueId, c.var.leagueId)),
    });
    if (!photo) notFound("Photo not found");
    if (!canModify(c, photo.uploaderId)) forbidden("Only whoever posted it, or the league owner, can remove it");
    await db.delete(schema.photos).where(eq(schema.photos.id, photo.id));
    await deleteObjects([`${photo.storageKey}.webp`, `${photo.storageKey}_thumb.webp`]).catch((err) => console.error("photo delete failed", err));
    await publish({ leagueId: c.var.leagueId, kind: "photos", ref: photo.eventId });
    return c.json({ ok: true });
  });
