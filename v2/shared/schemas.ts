/**
 * Request schemas and response shapes shared by the API and the web client.
 * The server validates every body with these; the client imports the types.
 */
import { z } from "zod";

export const CATEGORIES = [
  "Sports & Fitness",
  "Watch a Game",
  "Food & Drink",
  "Outdoors",
  "Games & Trivia",
  "Family Outing",
  "Helping Out",
  "Casual Hangout",
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");

export const notificationPrefsSchema = z.object({
  messages: z.boolean(),
  posts: z.boolean(),
  ideas: z.boolean(),
  events: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const updateProfileSchema = z.object({
  name: trimmed(80).min(1).optional(),
  location: optionalText(120),
  availability: optionalText(200),
  interests: z.array(trimmed(40).min(1)).max(20).optional(),
  notificationPrefs: notificationPrefsSchema.optional(),
});

const timezoneSchema = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone");

/*
 * Each resource defines its fields once WITHOUT defaults. Create schemas add the defaults;
 * update schemas are `.partial()` of the bare fields. (A `.default()` inside a partial schema
 * still fires for omitted keys, which would silently blank fields an edit didn't touch.)
 */
const leagueFields = {
  name: trimmed(80).min(1),
  description: trimmed(500),
  timezone: timezoneSchema,
};
export const createLeagueSchema = z.object({
  ...leagueFields,
  description: leagueFields.description.default(""),
  timezone: leagueFields.timezone.optional(),
});
export const updateLeagueSchema = z.object(leagueFields).partial().extend({
  commissionerEnabled: z.boolean().optional(),
});
export const joinLeagueSchema = z.object({ code: trimmed(32).min(1) });

const ideaFields = {
  title: trimmed(120).min(1),
  description: trimmed(1000),
  category: categorySchema,
  location: optionalText(200),
  aiSuggested: z.boolean(),
};
export const createIdeaSchema = z.object({
  ...ideaFields,
  description: ideaFields.description.default(""),
  aiSuggested: ideaFields.aiSuggested.default(false),
});
export const updateIdeaSchema = z
  .object(ideaFields)
  .omit({ aiSuggested: true })
  .partial()
  .extend({ archived: z.boolean().optional() });

/** A location picked from map search. Absent/null means free-text location only. */
export const placeSchema = z.object({
  placeId: z.string().min(1).max(300),
  address: trimmed(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type PlaceInput = z.infer<typeof placeSchema>;

const eventFields = {
  title: trimmed(120).min(1),
  category: categorySchema,
  description: trimmed(2000),
  location: optionalText(200),
  url: httpUrl.optional().nullable().transform((v) => v ?? null),
  startsAt: z.iso.datetime({ offset: true }),
  place: placeSchema.nullable().optional(),
};
export const createEventSchema = z.object({
  ...eventFields,
  description: eventFields.description.default(""),
  ideaId: z.uuid().optional().nullable(),
});
export const updateEventSchema = z.object(eventFields).partial().extend({
  cancelled: z.boolean().optional(),
});

/** How a standing meetup repeats. `nth` 5 means "last". */
export const repeatRuleSchema = z.discriminatedUnion("freq", [
  z.object({ freq: z.literal("weekly"), weekday: z.number().int().min(0).max(6) }),
  z.object({ freq: z.literal("biweekly"), weekday: z.number().int().min(0).max(6) }),
  z.object({ freq: z.literal("monthly"), weekday: z.number().int().min(0).max(6), nth: z.number().int().min(1).max(5) }),
]);
export type RepeatRule = z.infer<typeof repeatRuleSchema>;

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const seriesFields = {
  title: trimmed(120).min(1),
  category: categorySchema,
  description: trimmed(2000),
  location: optionalText(200),
  url: httpUrl.optional().nullable().transform((v) => v ?? null),
  timeOfDay: timeOfDaySchema,
  place: placeSchema.nullable().optional(),
  hostRotation: z.array(z.uuid()).max(50),
};
export const createSeriesSchema = z.object({
  ...seriesFields,
  description: seriesFields.description.default(""),
  hostRotation: seriesFields.hostRotation.default([]),
  rule: repeatRuleSchema,
  timezone: timezoneSchema,
  startsOn: z.iso.date(),
});
/** Editing a standing meetup. Changing how often it repeats means starting a new one. */
export const updateSeriesSchema = z.object(seriesFields).partial().extend({
  paused: z.boolean().optional(),
});

export const rsvpSchema = z.object({ status: z.enum(["going", "not_going"]).nullable() });

export const createPostSchema = z.object({
  title: trimmed(140).min(1),
  body: trimmed(5000).default(""),
  linkUrl: httpUrl.optional().nullable().transform((v) => v ?? null),
});
export const createCommentSchema = z.object({ body: trimmed(2000).min(1) });

export const handOffHostSchema = z.object({ userId: z.uuid() });

export const createMessageSchema = z.object({
  body: trimmed(4000).min(1),
  eventId: z.uuid().optional().nullable(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const ideaSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      category: categorySchema,
    }),
  ),
});
export type IdeaSuggestion = z.infer<typeof ideaSuggestionSchema>["suggestions"][number];

// ---- Response shapes ----

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string | null;
}

export interface UserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Me extends UserSummary {
  email: string;
  location: string | null;
  availability: string | null;
  interests: string[];
  notificationPrefs: NotificationPrefs;
  createdAt: string;
}

export interface LeagueSummary {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  timezone: string;
  commissionerEnabled: boolean;
  role: "owner" | "member";
  memberCount: number;
}

export interface Member extends UserSummary {
  role: "owner" | "member";
  location: string | null;
  availability: string | null;
  interests: string[];
  joinedAt: string;
  stats: {
    eventsAttended: number;
    eventsHosted: number;
    ideasProposed: number;
    messagesSent: number;
    eventsDeclined: number;
  };
}

export interface Idea {
  id: string;
  title: string;
  description: string;
  category: Category;
  location: string | null;
  aiSuggested: boolean;
  archived: boolean;
  author: UserSummary;
  voteCount: number;
  votedByMe: boolean;
  createdAt: string;
}

export interface EventItem {
  id: string;
  title: string;
  category: Category;
  description: string;
  location: string | null;
  url: string | null;
  startsAt: string;
  cancelled: boolean;
  ideaId: string | null;
  place: { placeId: string; address: string; lat: number; lng: number } | null;
  series: { id: string; label: string } | null;
  host: UserSummary;
  going: UserSummary[];
  notGoing: UserSummary[];
  myRsvp: "going" | "not_going" | null;
  messageCount: number;
  photoCount: number;
}

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  address: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Series {
  id: string;
  title: string;
  category: Category;
  description: string;
  location: string | null;
  place: { placeId: string; address: string; lat: number; lng: number } | null;
  url: string | null;
  rule: RepeatRule;
  label: string;
  timeOfDay: string;
  timezone: string;
  paused: boolean;
  createdBy: string;
  rotation: UserSummary[];
  nextHost: UserSummary | null;
  nextEvent: { id: string; startsAt: string } | null;
}

export interface Photo {
  id: string;
  eventId: string;
  eventTitle: string;
  uploader: UserSummary;
  width: number;
  height: number;
  thumbUrl: string;
  fullUrl: string;
  createdAt: string;
}

export interface CommissionerProposal {
  title: string;
  category: Category;
  ideaId: string | null;
  startsAt: string;
  location: string | null;
  acceptedEventId: string | null;
}

export interface Wrapped {
  year: number;
  leagueName: string;
  meetups: number;
  totalRsvps: number;
  dadsInvolved: number;
  photos: number;
  busiestMonth: { month: number; meetups: number } | null;
  topCategory: { category: Category; meetups: number } | null;
  biggestEvent: { id: string; title: string; startsAt: string; going: number } | null;
  ideasPitched: number;
  messages: number;
  leaders: {
    ironman: { user: UserSummary; count: number } | null;
    headCoach: { user: UserSummary; count: number } | null;
    ideaMachine: { user: UserSummary; count: number } | null;
    giftOfGab: { user: UserSummary; count: number } | null;
  };
  collage: Photo[];
}

export interface Post {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  author: UserSummary;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  createdAt: string;
}

export interface Comment {
  id: string;
  body: string;
  author: UserSummary;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  body: string;
  eventId: string | null;
  /** Null for Commissioner messages. */
  author: UserSummary | null;
  kind: "user" | "commissioner";
  proposal: CommissionerProposal | null;
  createdAt: string;
}

/** Pushed over the league SSE stream so clients know which queries to refetch. */
export interface LeagueChange {
  leagueId: string;
  kind: "messages" | "events" | "ideas" | "posts" | "members" | "league" | "series" | "photos";
  /** For messages: the channel (event id, or null for general). For posts: the post id. */
  ref?: string | null;
}
