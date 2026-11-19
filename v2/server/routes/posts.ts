import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { type Comment, type Post, createCommentSchema, createPostSchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { forbidden, notFound, uuidParam } from "../lib/access.js";
import { iso, parseBody, userSummary } from "../lib/http.js";
import { fetchLinkPreview } from "../lib/linkPreview.js";
import { notifyLeague } from "../lib/push.js";
import { publish } from "../lib/realtime.js";
import { canModify, scopedRouter } from "./scope.js";

const PAGE = 20;

async function listPosts(leagueId: string, meId: string, opts: { before?: Date; id?: string }): Promise<Post[]> {
  const p = schema.posts;
  const rows = await db
    .select({
      post: p,
      author: userSummary,
      likeCount: sql<number>`(select count(*)::int from ${schema.postLikes} l where l.post_id = ${p.id})`,
      likedByMe: sql<boolean>`exists(select 1 from ${schema.postLikes} l where l.post_id = ${p.id} and l.user_id = ${meId})`,
      commentCount: sql<number>`(select count(*)::int from ${schema.postComments} c where c.post_id = ${p.id})`,
    })
    .from(p)
    .innerJoin(schema.users, eq(schema.users.id, p.authorId))
    .where(and(eq(p.leagueId, leagueId), opts.id ? eq(p.id, opts.id) : undefined, opts.before ? lt(p.createdAt, opts.before) : undefined))
    .orderBy(desc(p.createdAt))
    .limit(PAGE);
  return rows.map(({ post, ...rest }) => ({
    id: post.id,
    title: post.title,
    body: post.body,
    linkUrl: post.linkUrl,
    linkPreview: post.linkPreview,
    createdAt: iso(post.createdAt),
    ...rest,
  }));
}

async function loadPost(leagueId: string, postId: string) {
  const post = await db.query.posts.findFirst({
    where: and(eq(schema.posts.id, postId), eq(schema.posts.leagueId, leagueId)),
  });
  return post ?? notFound("Post not found");
}

export const postRoutes = scopedRouter()
  .get("/", async (c) => {
    const before = c.req.query("before");
    const posts = await listPosts(c.var.leagueId, c.var.user.id, {
      before: before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined,
    });
    return c.json({ posts, nextCursor: posts.length === PAGE ? posts.at(-1)!.createdAt : null });
  })

  .post("/", async (c) => {
    const body = await parseBody(c, createPostSchema);
    const linkPreview = body.linkUrl ? await fetchLinkPreview(body.linkUrl) : null;
    const [post] = await db
      .insert(schema.posts)
      .values({ ...body, linkPreview, leagueId: c.var.leagueId, authorId: c.var.user.id })
      .returning();
    await publish({ leagueId: c.var.leagueId, kind: "posts" });
    void notifyLeague(c.var.leagueId, c.var.user.id, "posts", {
      title: `📌 ${c.var.user.name} posted`,
      body: post!.title,
      url: `/l/${c.var.leagueId}/board`,
    });
    const [full] = await listPosts(c.var.leagueId, c.var.user.id, { id: post!.id });
    return c.json({ post: full }, 201);
  })

  .delete("/:postId", async (c) => {
    const post = await loadPost(c.var.leagueId, uuidParam(c.req.param("postId")));
    if (!canModify(c, post.authorId)) forbidden("Only the author or league owner can delete this post");
    await db.delete(schema.posts).where(eq(schema.posts.id, post.id));
    await publish({ leagueId: c.var.leagueId, kind: "posts" });
    return c.json({ ok: true });
  })

  .put("/:postId/like", async (c) => {
    const post = await loadPost(c.var.leagueId, uuidParam(c.req.param("postId")));
    await db.insert(schema.postLikes).values({ postId: post.id, userId: c.var.user.id }).onConflictDoNothing();
    await publish({ leagueId: c.var.leagueId, kind: "posts" });
    return c.json({ ok: true });
  })

  .delete("/:postId/like", async (c) => {
    const post = await loadPost(c.var.leagueId, uuidParam(c.req.param("postId")));
    await db
      .delete(schema.postLikes)
      .where(and(eq(schema.postLikes.postId, post.id), eq(schema.postLikes.userId, c.var.user.id)));
    await publish({ leagueId: c.var.leagueId, kind: "posts" });
    return c.json({ ok: true });
  })

  .get("/:postId/comments", async (c) => {
    const post = await loadPost(c.var.leagueId, uuidParam(c.req.param("postId")));
    const rows = await db
      .select({ comment: schema.postComments, author: userSummary })
      .from(schema.postComments)
      .innerJoin(schema.users, eq(schema.users.id, schema.postComments.authorId))
      .where(eq(schema.postComments.postId, post.id))
      .orderBy(asc(schema.postComments.createdAt));
    const comments: Comment[] = rows.map(({ comment, author }) => ({
      id: comment.id,
      body: comment.body,
      author,
      createdAt: iso(comment.createdAt),
    }));
    return c.json({ comments });
  })

  .post("/:postId/comments", async (c) => {
    const post = await loadPost(c.var.leagueId, uuidParam(c.req.param("postId")));
    const { body } = await parseBody(c, createCommentSchema);
    const [comment] = await db
      .insert(schema.postComments)
      .values({ postId: post.id, authorId: c.var.user.id, body })
      .returning();
    await publish({ leagueId: c.var.leagueId, kind: "posts", ref: post.id });
    const out: Comment = {
      id: comment!.id,
      body: comment!.body,
      author: { id: c.var.user.id, name: c.var.user.name, avatarUrl: c.var.user.avatarUrl },
      createdAt: iso(comment!.createdAt),
    };
    return c.json({ comment: out }, 201);
  })

  .delete("/:postId/comments/:commentId", async (c) => {
    const post = await loadPost(c.var.leagueId, uuidParam(c.req.param("postId")));
    const comment = await db.query.postComments.findFirst({
      where: and(eq(schema.postComments.id, uuidParam(c.req.param("commentId"))), eq(schema.postComments.postId, post.id)),
    });
    if (!comment) notFound("Comment not found");
    if (!canModify(c, comment.authorId)) forbidden();
    await db.delete(schema.postComments).where(eq(schema.postComments.id, comment.id));
    await publish({ leagueId: c.var.leagueId, kind: "posts", ref: post.id });
    return c.json({ ok: true });
  });
