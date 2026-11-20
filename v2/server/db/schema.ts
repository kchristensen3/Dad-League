import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { CommissionerProposal, LinkPreview, NotificationPrefs, RepeatRule } from "../../shared/schemas.js";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  googleSub: text("google_sub").unique(),
  appleSub: text("apple_sub").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  location: text("location"),
  availability: text("availability"),
  interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
  notificationPrefs: jsonb("notification_prefs")
    .$type<NotificationPrefs>()
    .notNull()
    .default({ messages: true, posts: true, ideas: true, events: true }),
  createdAt: createdAt(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const leagues = pgTable("leagues", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  inviteCode: text("invite_code").notNull().unique(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  /** IANA zone used for recurring meetups and the Commissioner's Monday note. */
  timezone: text("timezone").notNull().default("America/New_York"),
  commissionerEnabled: boolean("commissioner_enabled").notNull().default(true),
  commissionerLastRunAt: timestamp("commissioner_last_run_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const leagueMembers = pgTable(
  "league_members",
  {
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] }), index("league_members_user_idx").on(t.userId)],
);

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    location: text("location"),
    aiSuggested: boolean("ai_suggested").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("ideas_league_idx").on(t.leagueId)],
);

export const ideaVotes = pgTable(
  "idea_votes",
  {
    ideaId: uuid("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.userId] })],
);

/** A standing meetup ("first Thursday of the month") that generates events ahead of time. */
export const eventSeries = pgTable(
  "event_series",
  {
    id: id(),
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    location: text("location"),
    /** Set when the location was picked from map search: Google place id, street address and coordinates. */
    placeId: text("place_id"),
    placeAddress: text("place_address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    url: text("url"),
    rule: jsonb("rule").$type<RepeatRule>().notNull(),
    /** Local wall-clock time, "HH:MM", in `timezone`. */
    timeOfDay: text("time_of_day").notNull(),
    timezone: text("timezone").notNull(),
    /** First date (YYYY-MM-DD) the series may occur on. */
    startsOn: text("starts_on").notNull(),
    /** Host order; empty means the creator always hosts. */
    hostRotation: uuid("host_rotation").array().notNull().default(sql`'{}'::uuid[]`),
    nextHostIndex: integer("next_host_index").notNull().default(0),
    /** Date (YYYY-MM-DD) of the last occurrence generated, so deleted ones aren't recreated. */
    lastGeneratedOn: text("last_generated_on"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("event_series_league_idx").on(t.leagueId)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    hostId: uuid("host_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ideaId: uuid("idea_id").references(() => ideas.id, { onDelete: "set null" }),
    seriesId: uuid("series_id").references(() => eventSeries.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    location: text("location"),
    /** Set when the location was picked from map search: Google place id, street address and coordinates. */
    placeId: text("place_id"),
    placeAddress: text("place_address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    url: text("url"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    recapPromptedAt: timestamp("recap_prompted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("events_league_starts_idx").on(t.leagueId, t.startsAt), index("events_series_idx").on(t.seriesId)],
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["going", "not_going"] }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    linkUrl: text("link_url"),
    linkPreview: jsonb("link_preview").$type<LinkPreview>(),
    createdAt: createdAt(),
  },
  (t) => [index("posts_league_idx").on(t.leagueId, t.createdAt)],
);

export const postLikes = pgTable(
  "post_likes",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const postComments = pgTable(
  "post_comments",
  {
    id: id(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("post_comments_post_idx").on(t.postId, t.createdAt)],
);

/**
 * Chat messages. `eventId` null = the league's general channel; otherwise the event's thread.
 * `kind = 'commissioner'` messages are written by Claude and have no author.
 */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["user", "commissioner"] }).notNull().default("user"),
    proposal: jsonb("proposal").$type<CommissionerProposal>(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_channel_idx").on(t.leagueId, t.eventId, t.createdAt)],
);

export const photos = pgTable(
  "photos",
  {
    id: id(),
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Storage key prefix; the files are `${key}.webp` and `${key}_thumb.webp`. */
    storageKey: text("storage_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("photos_event_idx").on(t.eventId), index("photos_league_idx").on(t.leagueId, t.createdAt)],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
});
