import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Heart, MessageSquare, Newspaper, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Post } from "../../../shared/schemas";
import { api } from "../api";
import { Avatar, Button, Card, Empty, ErrorNote, Field, Input, RichText, Sheet, Spinner, Textarea, cx } from "../components/ui";
import { useDocumentTitle, useLeague, useLeagueId, useMe } from "../hooks";

const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

function NewPost({ leagueId, open, onClose }: { leagueId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const m = useMutation({
    mutationFn: () => api.createPost(leagueId, { title, body, linkUrl: linkUrl || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["posts", leagueId] });
      setTitle("");
      setBody("");
      setLinkUrl("");
      onClose();
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title="New post">
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <Field label="Headline">
          <Input required maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Anyone have a tile saw I can borrow?" />
        </Field>
        <Field label="Details">
          <Textarea rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label="Link" hint="We'll pull in a preview.">
          <Input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" />
        </Field>
        <ErrorNote error={m.error} />
        <Button type="submit" className="w-full" loading={m.isPending}>Post</Button>
      </form>
    </Sheet>
  );
}

function Comments({ leagueId, post }: { leagueId: string; post: Post }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [text, setText] = useState("");
  const key = ["comments", leagueId, post.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.comments(leagueId, post.id) });
  const add = useMutation({
    mutationFn: () => api.addComment(leagueId, post.id, text),
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["posts", leagueId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(leagueId, post.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["posts", leagueId] });
    },
  });
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      {q.isLoading && <Spinner className="py-2" />}
      {q.data?.map((c) => (
        <div key={c.id} className="group flex gap-2">
          <Avatar user={c.author} size={26} />
          <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-600">
              {c.author.name} <span className="font-normal text-slate-400">· {ago(c.createdAt)}</span>
            </p>
            <RichText text={c.body} className="text-sm" />
          </div>
          {c.author.id === me?.id && (
            <button onClick={() => remove.mutate(c.id)} className="hidden self-center text-slate-300 hover:text-red-500 group-hover:block" aria-label="Delete comment">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), text.trim() && add.mutate())}>
        <Input value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Comment" />
        <Button type="submit" size="sm" loading={add.isPending} disabled={!text.trim()}>Reply</Button>
      </form>
    </div>
  );
}

function PostCard({ leagueId, post }: { leagueId: string; post: Post }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const league = useLeague(leagueId);
  const [showComments, setShowComments] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["posts", leagueId] });
  const like = useMutation({ mutationFn: () => api.like(leagueId, post.id, !post.likedByMe), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.deletePost(leagueId, post.id), onSuccess: refresh });
  const canDelete = post.author.id === me?.id || league.data?.role === "owner";
  const preview = post.linkPreview;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Avatar user={post.author} size={34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{post.author.name}</p>
          <p className="text-xs text-slate-400">{ago(post.createdAt)}</p>
        </div>
        {canDelete && (
          <button onClick={() => confirm("Delete this post?") && remove.mutate()} className="p-1 text-slate-300 hover:text-red-500" aria-label="Delete post">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-bold leading-snug">{post.title}</h3>
        {post.body && <RichText text={post.body} className="text-sm text-slate-700" />}
      </div>
      {post.linkUrl && (
        <a href={post.linkUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-slate-200 hover:ring-brand-300">
          {preview?.image && <img src={preview.image} alt="" loading="lazy" className="aspect-[1.91/1] w-full bg-slate-100 object-cover" />}
          <div className="space-y-0.5 bg-slate-50 px-3 py-2">
            <p className="truncate text-[11px] uppercase tracking-wide text-slate-400">{new URL(post.linkUrl).hostname}</p>
            <p className="line-clamp-2 text-sm font-semibold">{preview?.title ?? post.linkUrl}</p>
            {preview?.description && <p className="line-clamp-2 text-xs text-slate-500">{preview.description}</p>}
          </div>
        </a>
      )}
      <div className="flex gap-4 text-sm font-semibold text-slate-500">
        <button onClick={() => like.mutate()} className={cx("flex items-center gap-1", post.likedByMe && "text-rose-500")} aria-pressed={post.likedByMe}>
          <Heart size={16} fill={post.likedByMe ? "currentColor" : "none"} /> {post.likeCount || ""}
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1">
          <MessageSquare size={16} /> {post.commentCount || ""} {post.commentCount === 1 ? "comment" : "comments"}
        </button>
      </div>
      {showComments && <Comments leagueId={leagueId} post={post} />}
    </Card>
  );
}

export default function Board() {
  const leagueId = useLeagueId();
  useDocumentTitle("Board");
  const [composing, setComposing] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ["posts", leagueId],
    queryFn: ({ pageParam }) => api.posts(leagueId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const posts = q.data?.pages.flatMap((p) => p.posts) ?? [];
  return (
    <div className="space-y-4">
      <section className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Board</h1>
          <p className="text-sm text-slate-500">Asks, tips, links and things worth keeping.</p>
        </div>
        <Button onClick={() => setComposing(true)}>
          <Plus size={16} /> Post
        </Button>
      </section>
      {q.isLoading ? (
        <Spinner />
      ) : posts.length ? (
        <div className="space-y-3">
          {posts.map((p) => <PostCard key={p.id} leagueId={leagueId} post={p} />)}
          {q.hasNextPage && (
            <Button variant="secondary" className="w-full" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              Older posts
            </Button>
          )}
        </div>
      ) : (
        <Empty icon={<Newspaper size={36} />} title="The board is empty">Need a recommendation? Selling a crib? Post it here.</Empty>
      )}
      <NewPost leagueId={leagueId} open={composing} onClose={() => setComposing(false)} />
    </div>
  );
}
