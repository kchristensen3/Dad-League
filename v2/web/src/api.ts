import type {
  ChatMessage,
  Comment,
  EventItem,
  Idea,
  IdeaSuggestion,
  LeagueSummary,
  Me,
  Member,
  Photo,
  PlaceDetails,
  PlaceInput,
  PlaceSuggestion,
  Post,
  RepeatRule,
  Series,
  Wrapped,
} from "../../shared/schemas";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b: unknown = {}) => request<T>("POST", p, b);
const patch = <T>(p: string, b: unknown) => request<T>("PATCH", p, b);
const put = <T>(p: string, b: unknown = {}) => request<T>("PUT", p, b);
const del = <T>(p: string) => request<T>("DELETE", p);

const L = (leagueId: string) => `/api/leagues/${leagueId}`;

export const api = {
  authConfig: () => get<{ google: boolean; apple: boolean; devLogin: boolean; maps: boolean }>("/auth/config"),
  devLogin: (email: string, name?: string) => post("/auth/dev", { email, name }),
  logout: () => post("/auth/logout"),

  me: () => get<{ user: Me | null }>("/api/me").then((r) => r.user),
  updateMe: (body: Partial<Pick<Me, "name" | "location" | "availability" | "interests" | "notificationPrefs">>) =>
    patch<{ user: Me }>("/api/me", body).then((r) => r.user),
  deleteMe: () => del("/api/me"),
  pushConfig: () => get<{ enabled: boolean; publicKey: string | null }>("/api/me/push"),
  savePushSubscription: (sub: PushSubscriptionJSON) => post("/api/me/push", sub),
  testPush: () => post<{ devices: number; delivered: number; expired: number }>("/api/me/push/test"),

  invite: (code: string) =>
    get<{ invite: { name: string; description: string; memberCount: number } }>(`/api/invites/${encodeURIComponent(code)}`).then(
      (r) => r.invite,
    ),
  leagues: () => get<{ leagues: LeagueSummary[] }>("/api/leagues").then((r) => r.leagues),
  league: (id: string) => get<{ league: LeagueSummary }>(L(id)).then((r) => r.league),
  createLeague: (body: { name: string; description: string; timezone?: string }) =>
    post<{ league: LeagueSummary }>("/api/leagues", body).then((r) => r.league),
  joinLeague: (code: string) =>
    post<{ league: LeagueSummary; alreadyMember: boolean }>("/api/leagues/join", { code }),
  updateLeague: (id: string, body: { name?: string; description?: string; timezone?: string; commissionerEnabled?: boolean }) =>
    patch<{ league: LeagueSummary }>(L(id), body).then((r) => r.league),
  rotateInvite: (id: string) => post<{ league: LeagueSummary }>(`${L(id)}/invite-code`).then((r) => r.league),
  deleteLeague: (id: string) => del(L(id)),
  members: (id: string) => get<{ members: Member[] }>(`${L(id)}/members`).then((r) => r.members),
  removeMember: (id: string, userId: string) => del(`${L(id)}/members/${userId}`),
  transferOwnership: (id: string, userId: string) => post(`${L(id)}/owner`, { userId }),

  ideas: (id: string, archived = false) =>
    get<{ ideas: Idea[] }>(`${L(id)}/ideas${archived ? "?archived=true" : ""}`).then((r) => r.ideas),
  createIdea: (id: string, body: Pick<Idea, "title" | "description" | "category" | "location"> & { aiSuggested?: boolean }) =>
    post<{ idea: Idea }>(`${L(id)}/ideas`, body).then((r) => r.idea),
  updateIdea: (id: string, ideaId: string, body: Partial<Pick<Idea, "title" | "description" | "category" | "location" | "archived">>) =>
    patch<{ idea: Idea }>(`${L(id)}/ideas/${ideaId}`, body).then((r) => r.idea),
  deleteIdea: (id: string, ideaId: string) => del(`${L(id)}/ideas/${ideaId}`),
  vote: (id: string, ideaId: string, on: boolean) =>
    on ? put(`${L(id)}/ideas/${ideaId}/vote`) : del(`${L(id)}/ideas/${ideaId}/vote`),
  suggestIdeas: (id: string, request?: string) =>
    post<{ suggestions: IdeaSuggestion[] }>(`${L(id)}/ideas/suggest`, { request }).then((r) => r.suggestions),

  events: (id: string, scope: "upcoming" | "past" = "upcoming") =>
    get<{ events: EventItem[] }>(`${L(id)}/events?scope=${scope}`).then((r) => r.events),
  event: (id: string, eventId: string) => get<{ event: EventItem }>(`${L(id)}/events/${eventId}`).then((r) => r.event),
  createEvent: (id: string, body: EventInput & { ideaId?: string | null }) =>
    post<{ event: EventItem }>(`${L(id)}/events`, body).then((r) => r.event),
  updateEvent: (id: string, eventId: string, body: Partial<EventInput> & { cancelled?: boolean }) =>
    patch<{ event: EventItem }>(`${L(id)}/events/${eventId}`, body).then((r) => r.event),
  deleteEvent: (id: string, eventId: string) => del(`${L(id)}/events/${eventId}`),
  rsvp: (id: string, eventId: string, status: "going" | "not_going" | null) =>
    put<{ event: EventItem }>(`${L(id)}/events/${eventId}/rsvp`, { status }).then((r) => r.event),

  posts: (id: string, before?: string) =>
    get<{ posts: Post[]; nextCursor: string | null }>(`${L(id)}/posts${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  createPost: (id: string, body: { title: string; body: string; linkUrl: string | null }) =>
    post<{ post: Post }>(`${L(id)}/posts`, body).then((r) => r.post),
  deletePost: (id: string, postId: string) => del(`${L(id)}/posts/${postId}`),
  like: (id: string, postId: string, on: boolean) =>
    on ? put(`${L(id)}/posts/${postId}/like`) : del(`${L(id)}/posts/${postId}/like`),
  comments: (id: string, postId: string) =>
    get<{ comments: Comment[] }>(`${L(id)}/posts/${postId}/comments`).then((r) => r.comments),
  addComment: (id: string, postId: string, body: string) =>
    post<{ comment: Comment }>(`${L(id)}/posts/${postId}/comments`, { body }).then((r) => r.comment),
  deleteComment: (id: string, postId: string, commentId: string) => del(`${L(id)}/posts/${postId}/comments/${commentId}`),

  handOffHost: (id: string, eventId: string, userId: string) =>
    put<{ event: EventItem }>(`${L(id)}/events/${eventId}/host`, { userId }).then((r) => r.event),

  series: (id: string) => get<{ series: Series[] }>(`${L(id)}/series`).then((r) => r.series),
  createSeries: (id: string, body: SeriesInput) =>
    post<{ series: Series; firstEventId: string | null }>(`${L(id)}/series`, body),
  updateSeries: (id: string, seriesId: string, body: { paused?: boolean; hostRotation?: string[] }) =>
    patch<{ series: Series }>(`${L(id)}/series/${seriesId}`, body).then((r) => r.series),
  deleteSeries: (id: string, seriesId: string) => del(`${L(id)}/series/${seriesId}`),

  photos: (id: string, eventId: string) =>
    get<{ photos: Photo[]; enabled: boolean }>(`${L(id)}/photos?eventId=${eventId}`),
  uploadPhotos: async (id: string, eventId: string, files: File[]) => {
    const form = new FormData();
    form.set("eventId", eventId);
    for (const f of files) form.append("photos", f);
    const res = await fetch(`${L(id)}/photos`, { method: "POST", body: form, credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Upload failed");
    return (data as { photos: Photo[] }).photos;
  },
  deletePhoto: (id: string, photoId: string) => del(`${L(id)}/photos/${photoId}`),
  wrapped: (id: string, year?: number) =>
    get<{ wrapped: Wrapped }>(`${L(id)}/wrapped${year ? `?year=${year}` : ""}`).then((r) => r.wrapped),

  placeSuggestions: (id: string, q: string, session: string, signal?: AbortSignal) =>
    fetch(`${L(id)}/places/autocomplete?q=${encodeURIComponent(q)}&session=${session}`, { signal, credentials: "same-origin" }).then(
      async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new ApiError(r.status, (data as { error?: string }).error ?? "Search failed");
        return (data as { suggestions: PlaceSuggestion[] }).suggestions;
      },
    ),
  placeDetails: (id: string, placeId: string, session: string) =>
    get<{ place: PlaceDetails }>(`${L(id)}/places/${encodeURIComponent(placeId)}?session=${session}`).then((r) => r.place),

  askCommissioner: (id: string) => post<{ ok: boolean }>(`${L(id)}/messages/commissioner`),
  acceptProposal: (id: string, messageId: string) =>
    post<{ eventId: string; alreadyAccepted: boolean }>(`${L(id)}/messages/${messageId}/accept`),

  messages: (id: string, eventId?: string | null, before?: string) => {
    const q = new URLSearchParams();
    if (eventId) q.set("eventId", eventId);
    if (before) q.set("before", before);
    return get<{ messages: ChatMessage[]; hasMore: boolean }>(`${L(id)}/messages?${q}`);
  },
  sendMessage: (id: string, body: string, eventId?: string | null) =>
    post<{ message: ChatMessage }>(`${L(id)}/messages`, { body, eventId: eventId ?? null }).then((r) => r.message),
  deleteMessage: (id: string, messageId: string) => del(`${L(id)}/messages/${messageId}`),
};

export interface EventInput {
  title: string;
  category: EventItem["category"];
  description: string;
  location: string | null;
  place?: PlaceInput | null;
  url: string | null;
  startsAt: string;
}

export interface SeriesInput {
  title: string;
  category: EventItem["category"];
  description: string;
  location: string | null;
  place?: PlaceInput | null;
  url: string | null;
  rule: RepeatRule;
  timeOfDay: string;
  timezone: string;
  startsOn: string;
  hostRotation: string[];
}

export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};
