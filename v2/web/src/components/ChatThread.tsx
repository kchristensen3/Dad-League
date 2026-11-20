import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { Send, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Member } from "../../../shared/schemas";
import { api } from "../api";
import { useMe, useMembers } from "../hooks";
import { Avatar, RichText, Spinner, cx } from "./ui";

const dayLabel = (d: Date) => (isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE, MMM d"));

function MentionMenu({ members, query, onPick }: { members: Member[]; query: string; onPick: (m: Member) => void }) {
  const matches = members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
  if (!matches.length) return null;
  return (
    <div className="absolute bottom-full left-0 mb-2 w-60 rounded-2xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
      {matches.map((m) => (
        <button
          key={m.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(m);
          }}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-slate-50"
        >
          <Avatar user={m} size={24} /> {m.name}
        </button>
      ))}
    </div>
  );
}

/**
 * A chat channel: the league's general chat (eventId = null) or an event thread.
 * New messages arrive via the league stream, which invalidates this query.
 */
export function ChatThread({ leagueId, eventId, className }: { leagueId: string; eventId: string | null; className?: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const members = useMembers(leagueId);
  const key = ["messages", leagueId, eventId ?? "general"];
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.messages(leagueId, eventId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
    // Live updates come over the league stream; this is just a backstop if a notification is missed.
    refetchInterval: 30_000,
  });
  const messages = useMemo(() => (q.data?.pages ?? []).toReversed().flatMap((p) => p.messages), [q.data]);

  const [text, setText] = useState("");
  const [mention, setMention] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  const send = useMutation({
    mutationFn: (body: string) => api.sendMessage(leagueId, body, eventId),
    onMutate: (body) => setText((t) => (t === body ? "" : t)),
    onSuccess: (msg) => {
      qc.setQueryData(key, (old: typeof q.data) =>
        old && !old.pages[0]!.messages.some((m) => m.id === msg.id)
          ? { ...old, pages: [{ ...old.pages[0]!, messages: [...old.pages[0]!.messages, msg] }, ...old.pages.slice(1)] }
          : old,
      );
    },
    onError: (_e, body) => setText(body),
  });
  const remove = useMutation({
    mutationFn: (m: ChatMessage) => api.deleteMessage(leagueId, m.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const onChange = (value: string) => {
    setText(value);
    const at = value.slice(0, inputRef.current?.selectionStart ?? value.length).match(/@([\p{L} ]{0,20})$/u);
    setMention(at ? at[1]! : null);
  };
  const pickMention = (m: Member) => {
    setText((t) => t.replace(/@([\p{L} ]{0,20})$/u, `@${m.name} `));
    setMention(null);
    inputRef.current?.focus();
  };
  const submit = () => {
    const body = text.trim();
    if (body && !send.isPending) send.mutate(body);
  };

  return (
    <div className={cx("flex flex-col", className)}>
      <div className="flex-1 space-y-1 overflow-y-auto px-1 pb-3">
        {q.hasNextPage && (
          <div className="py-2 text-center">
            <button className="text-xs font-semibold text-brand-600" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {q.isLoading && <Spinner />}
        {!q.isLoading && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            {eventId ? "Sort out rides, tickets and who's bringing what." : "Say what's up. Use @ to mention someone."}
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const d = new Date(m.createdAt);
          const newDay = !prev || !isSameDay(new Date(prev.createdAt), d);
          const grouped = !newDay && prev?.author.id === m.author.id && d.getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          const mine = m.author.id === me?.id;
          return (
            <div key={m.id}>
              {newDay && (
                <p className="py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">{dayLabel(d)}</p>
              )}
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18 }}
                style={{ transformOrigin: mine ? "bottom right" : "bottom left" }}
                className={cx("group flex items-end gap-2", mine && "flex-row-reverse", !grouped && "mt-2")}
              >
                <div className="w-7 shrink-0">{!grouped && !mine && <Avatar user={m.author} size={28} />}</div>
                <div className={cx("max-w-[78%]", mine && "text-right")}>
                  {!grouped && !mine && <p className="mb-0.5 ml-1 text-[11px] font-semibold text-slate-500">{m.author.name}</p>}
                  <div
                    className={cx(
                      "inline-block rounded-2xl px-3 py-2 text-left text-[15px] leading-snug",
                      mine ? "bg-brand-500 text-white [&_span.text-brand-600]:text-brand-100" : "bg-white text-slate-800 ring-1 ring-slate-200/70",
                    )}
                    title={format(d, "PPpp")}
                  >
                    <RichText text={m.body} />
                  </div>
                </div>
                {mine && (
                  <button
                    onClick={() => confirm("Delete this message?") && remove.mutate(m)}
                    className="mb-1 hidden text-slate-300 hover:text-red-500 group-hover:block"
                    aria-label="Delete message"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </motion.div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form
        className="relative flex items-end gap-2 border-t border-slate-200/70 bg-slate-100 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mention !== null && members.data && <MentionMenu members={members.data} query={mention} onPick={pickMention} />}
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          maxLength={4000}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message"
          aria-label="Message"
          className="flex-1 resize-none rounded-2xl border-0 bg-white px-4 py-2.5 text-[15px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <motion.button
          whileTap={{ scale: 0.85, rotate: -12 }}
          type="submit"
          disabled={!text.trim() || send.isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white disabled:opacity-40"
          aria-label="Send"
        >
          <Send size={18} />
        </motion.button>
      </form>
    </div>
  );
}
